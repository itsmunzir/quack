//! Quack's HTTP engine: a thin layer over reqwest.
//!
//! One `Engine` lives for the whole app session so cookies and pooled
//! connections carry over between requests, the way a browser tab would.

use std::time::{Duration, Instant};

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Version, redirect};

pub type Header = (String, String);

/// Largest response body kept in memory. Bigger downloads fail cleanly
/// instead of exhausting RAM.
pub const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

/// What the user asked to send.
pub struct Outgoing {
    pub method: String,
    pub url: String,
    pub headers: Vec<Header>,
    pub body: Option<Vec<u8>>,
    pub timeout: Option<Duration>,
}

/// What came back.
pub struct Incoming {
    pub status: u16,
    pub reason: Option<String>,
    pub url: String,
    pub version: String,
    pub headers: Vec<Header>,
    pub body: Vec<u8>,
    pub elapsed: Duration,
}

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("Invalid method: {0}")]
    Method(String),
    #[error("Invalid header \"{0}\"")]
    Header(String),
    #[error("Request timed out")]
    Timeout,
    #[error("Could not connect: {0}")]
    Connect(String),
    #[error("Response is larger than {} MB", MAX_BODY_BYTES / 1024 / 1024)]
    TooLarge,
    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for EngineError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            EngineError::Timeout
        } else if e.is_connect() {
            EngineError::Connect(root_cause(&e))
        } else {
            EngineError::Other(root_cause(&e))
        }
    }
}

pub struct Engine {
    client: Client,
}

impl Engine {
    pub fn new() -> Result<Self, EngineError> {
        let client = Client::builder()
            .user_agent(concat!("Quack/", env!("CARGO_PKG_VERSION")))
            .cookie_store(true)
            .redirect(redirect::Policy::limited(10))
            .connect_timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self { client })
    }

    pub async fn send(&self, req: Outgoing) -> Result<Incoming, EngineError> {
        let method = Method::from_bytes(req.method.trim().to_uppercase().as_bytes())
            .map_err(|_| EngineError::Method(req.method.clone()))?;

        let mut builder = self
            .client
            .request(method, normalize_url(&req.url))
            .headers(build_headers(&req.headers)?);
        if let Some(t) = req.timeout {
            builder = builder.timeout(t);
        }
        if let Some(body) = req.body {
            builder = builder.body(body);
        }

        let started = Instant::now();
        let mut res = builder.send().await?;

        let status = res.status();
        let url = res.url().to_string();
        let version = version_label(res.version()).to_string();
        let headers = res
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), String::from_utf8_lossy(v.as_bytes()).into_owned()))
            .collect();
        if res.content_length().is_some_and(|n| n > MAX_BODY_BYTES as u64) {
            return Err(EngineError::TooLarge);
        }
        let mut body = Vec::new();
        while let Some(chunk) = res.chunk().await? {
            if body.len() + chunk.len() > MAX_BODY_BYTES {
                return Err(EngineError::TooLarge);
            }
            body.extend_from_slice(&chunk);
        }

        Ok(Incoming {
            status: status.as_u16(),
            reason: status.canonical_reason().map(str::to_string),
            url,
            version,
            headers,
            body,
            elapsed: started.elapsed(),
        })
    }
}

/// Adds a scheme when the user typed a bare host. Local addresses get
/// `http://`, everything else gets `https://`.
pub fn normalize_url(input: &str) -> String {
    let url = input.trim();
    if url.contains("://") {
        return url.to_string();
    }
    let host = url.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit_once(':').map_or(host, |(h, port)| {
        if port.chars().all(|c| c.is_ascii_digit()) { h } else { host }
    });
    let local = host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.trim_matches(['[', ']']).parse::<std::net::IpAddr>().is_ok();
    format!("{}://{url}", if local { "http" } else { "https" })
}

fn build_headers(headers: &[Header]) -> Result<HeaderMap, EngineError> {
    let mut map = HeaderMap::new();
    for (name, value) in headers {
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        let key = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| EngineError::Header(name.to_string()))?;
        let val = HeaderValue::from_str(value.trim())
            .map_err(|_| EngineError::Header(name.to_string()))?;
        map.append(key, val);
    }
    Ok(map)
}

fn version_label(v: Version) -> &'static str {
    match v {
        Version::HTTP_09 => "HTTP/0.9",
        Version::HTTP_10 => "HTTP/1.0",
        Version::HTTP_11 => "HTTP/1.1",
        Version::HTTP_2 => "HTTP/2",
        Version::HTTP_3 => "HTTP/3",
        _ => "HTTP",
    }
}

/// reqwest wraps the useful message (DNS failure, refused, bad cert) a few
/// levels deep; surface the innermost one.
fn root_cause(e: &(dyn std::error::Error + 'static)) -> String {
    let mut cur = e;
    while let Some(next) = cur.source() {
        cur = next;
    }
    cur.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_explicit_scheme() {
        assert_eq!(normalize_url("http://example.com"), "http://example.com");
        assert_eq!(normalize_url("  ws://x  "), "ws://x");
    }

    #[test]
    fn remote_hosts_default_to_https() {
        assert_eq!(normalize_url("api.github.com/users"), "https://api.github.com/users");
        assert_eq!(normalize_url("example.com:8443"), "https://example.com:8443");
    }

    #[test]
    fn local_hosts_default_to_http() {
        assert_eq!(normalize_url("localhost:3000/api"), "http://localhost:3000/api");
        assert_eq!(normalize_url("127.0.0.1"), "http://127.0.0.1");
        assert_eq!(normalize_url("[::1]:8080"), "http://[::1]:8080");
        assert_eq!(normalize_url("printer.local"), "http://printer.local");
    }

    #[test]
    fn rejects_bad_header_names() {
        assert!(build_headers(&[("bad header".into(), "x".into())]).is_err());
        assert!(build_headers(&[("".into(), "ignored".into())]).unwrap().is_empty());
    }
}

#[cfg(test)]
mod live {
    use super::*;

    /// Hits the network; run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn sends_real_requests() {
        let engine = Engine::new().unwrap();
        let res = engine
            .send(Outgoing {
                method: "post".into(),
                url: "httpbin.org/post?x=1".into(),
                headers: vec![("Content-Type".into(), "application/json".into())],
                body: Some(br#"{"hello":"quack"}"#.to_vec()),
                timeout: Some(Duration::from_secs(20)),
            })
            .await
            .unwrap();
        assert_eq!(res.status, 200);
        assert!(res.url.starts_with("https://"));
        assert!(String::from_utf8_lossy(&res.body).contains("quack"));

        // Redirects are followed and gzip is decoded transparently.
        let res = engine
            .send(Outgoing {
                method: "GET".into(),
                url: "https://httpbin.org/redirect-to?url=/gzip".into(),
                headers: vec![],
                body: None,
                timeout: Some(Duration::from_secs(20)),
            })
            .await
            .unwrap();
        assert_eq!(res.status, 200);
        assert!(res.url.ends_with("/gzip"));
        assert!(String::from_utf8_lossy(&res.body).contains("\"gzipped\": true"));
    }
}
