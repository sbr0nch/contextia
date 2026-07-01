// packages/engine/src/detectors/_util.ts
function matchAll(re, text) {
  const out = [];
  for (const m of text.matchAll(re)) {
    const start = m.index;
    out.push({ start, end: start + m[0].length, match: m[0] });
  }
  return out;
}
function luhn(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}
function shannon(s) {
  const freq = /* @__PURE__ */ new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// packages/engine/src/detectors/aws-access-key-id.ts
var RE = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z2-7])[A-Z2-7]{16}\b/g;
var awsAccessKeyId = {
  id: "aws_access_key_id",
  label: "AWS access key ID",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE, text),
  fixtures: {
    positives: [
      "AKIAIOSFODNN7EXAMPLE",
      "aws_access_key_id = ASIAJ4ZEXAMPLE7QABCD",
      "key: AGPAIOSFODNN7EXAMPLE"
    ],
    negatives: [
      "AKIA0123456789ABCDEF",
      // 0/1/8/9 are not valid Base32 — not a real key id
      "akiaiosfodnn7example",
      // lowercase, not a key
      "no aws credentials in this sentence"
    ]
  }
};

// packages/engine/src/detectors/aws-secret-access-key.ts
var ACCESS_KEY_ID = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T[A-Z2-7])[A-Z2-7]{16}\b/;
var SECRET = /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g;
var awsSecretAccessKey = {
  id: "aws_secret_access_key",
  label: "AWS secret access key",
  severity: "critical",
  defaultEnabled: true,
  scan(text) {
    if (!ACCESS_KEY_ID.test(text)) return [];
    return matchAll(SECRET, text);
  },
  fixtures: {
    positives: [
      "AKIAIOSFODNN7EXAMPLE secret=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "ASIAJ4ZEXAMPLE7QABCD " + "a".repeat(40),
      "AKIAIOSFODNN7EXAMPLE " + "Ab3dEf01".repeat(5)
    ],
    negatives: [
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      // lone secret, no access key id
      "AKIAIOSFODNN7EXAMPLE is only the key id here",
      // id present, no secret
      "nothing sensitive at all in this text line"
    ]
  }
};

// packages/engine/src/detectors/gcp-key.ts
var RE2 = /\bAIza[0-9A-Za-z_-]{35}\b/g;
var gcpKey = {
  id: "gcp_key",
  label: "Google API key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE2, text),
  fixtures: {
    positives: [
      "AIza" + "a".repeat(35),
      "key=AIza" + "SyB0".repeat(8) + "xyz",
      "GOOGLE_API_KEY: AIza" + "0123456789".repeat(3) + "abcde"
    ],
    negatives: [
      "AIza-too-short",
      "this is not a google key",
      "AIzaSy lowercase prose without a token"
    ]
  }
};

// packages/engine/src/detectors/azure-key.ts
var RE3 = /AccountKey=[A-Za-z0-9+/]{60,}/g;
var azureKey = {
  id: "azure_key",
  label: "Azure storage account key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE3, text),
  fixtures: {
    positives: [
      "AccountKey=" + "a".repeat(88),
      "DefaultEndpointsProtocol=https;AccountName=x;AccountKey=" + "Zm9vYmFy".repeat(11),
      "conn AccountKey=" + "AbCd1234".repeat(9)
    ],
    negatives: [
      "AccountKey=tooShort==",
      "AccountName=mystorageaccount",
      "no azure connection string here"
    ]
  }
};

// packages/engine/src/detectors/github-token.ts
var RE4 = /\bgh[opusr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[0-9A-Za-z]{22}_[0-9A-Za-z]{59}\b/g;
var githubToken = {
  id: "github_token",
  label: "GitHub token",
  severity: "critical",
  defaultEnabled: true,
  rationale: "A GitHub token can read or push to your repositories \u2014 revoke it if it leaks.",
  scan: (text) => matchAll(RE4, text),
  fixtures: {
    positives: [
      "ghp_" + "a".repeat(36),
      "gho_0123456789abcdefABCDEF0123456789abcd",
      "github_pat_" + "A".repeat(22) + "_" + "b".repeat(59)
    ],
    negatives: [
      "ghp_short",
      "github_pat_too_short",
      "just a normal sentence about github"
    ]
  }
};

// packages/engine/src/detectors/anthropic-key.ts
var RE5 = /\bsk-ant-[A-Za-z0-9_-]{20,}/g;
var anthropicKey = {
  id: "anthropic_key",
  label: "Anthropic API key",
  severity: "critical",
  defaultEnabled: true,
  rationale: "An Anthropic API key grants billable access to your account \u2014 never paste it into a prompt.",
  scan: (text) => matchAll(RE5, text),
  fixtures: {
    positives: [
      "sk-ant-api03-" + "a".repeat(20),
      "sk-ant-" + "AbCd12_-".repeat(4),
      "key sk-ant-" + "x".repeat(30)
    ],
    negatives: [
      "sk-ant-short",
      "sk-something-else-entirely",
      "no anthropic key in this line"
    ]
  }
};

// packages/engine/src/detectors/openai-key.ts
var RE6 = /\bsk-(?!ant-)(?:proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{48})\b/g;
var openaiKey = {
  id: "openai_key",
  label: "OpenAI API key",
  severity: "critical",
  defaultEnabled: true,
  rationale: "An OpenAI API key grants billable access to your account \u2014 never paste it into a prompt.",
  scan: (text) => matchAll(RE6, text),
  fixtures: {
    positives: [
      "sk-proj-" + "a".repeat(24),
      "sk-" + "a".repeat(48),
      "OPENAI_API_KEY=sk-" + "T3BlbkFJ".repeat(6)
    ],
    negatives: [
      "sk-ant-api03-" + "a".repeat(20),
      // Anthropic, not OpenAI
      "sk-short",
      "just text, no key here"
    ]
  }
};

// packages/engine/src/detectors/slack-token.ts
var RE7 = /\bxox[baprs]-[A-Za-z0-9-]{10,}/g;
var slackToken = {
  id: "slack_token",
  label: "Slack token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE7, text),
  fixtures: {
    positives: [
      "xoxb-12345678901234567890",
      "xoxp-abcdefghij-klmnopqrst",
      "token: xoxs-" + "A".repeat(15)
    ],
    negatives: [
      "xox-nope",
      "xoxz-1234567890",
      // z is not a valid token type
      "normal text without a token"
    ]
  }
};

// packages/engine/src/detectors/stripe-live-key.ts
var RE8 = /\b[sprk]k_live_[A-Za-z0-9]{16,}\b/g;
var stripeLiveKey = {
  id: "stripe_live_key",
  label: "Stripe live key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE8, text),
  fixtures: {
    positives: [
      "sk_live_" + "a".repeat(24),
      "pk_live_0123456789abcdef",
      "rk_live_" + "A".repeat(20)
    ],
    negatives: [
      "sk_test_abcdefghijklmnop",
      // test, not live
      "pk_live_short",
      "no stripe key in this sentence"
    ]
  }
};

// packages/engine/src/detectors/private-key.ts
var BLOCK = /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----/g;
var privateKey = {
  id: "private_key",
  label: "Private key block",
  severity: "critical",
  defaultEnabled: true,
  rationale: "A PEM private key authenticates as you \u2014 anyone who reads it can impersonate the key holder.",
  scan(text) {
    const out = [];
    for (const m of text.matchAll(BLOCK)) {
      const start = m.index;
      out.push({ start, end: start + m[0].length, match: m[0] });
    }
    return out;
  },
  fixtures: {
    positives: [
      "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX\n-----END RSA PRIVATE KEY-----",
      "-----BEGIN PRIVATE KEY-----\nMIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAw\n-----END PRIVATE KEY-----",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAA\n-----END OPENSSH PRIVATE KEY-----"
    ],
    negatives: [
      "-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG\n-----END CERTIFICATE-----",
      "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
      "load the private key from the keystore before signing the request"
    ]
  }
};

// packages/engine/src/detectors/env-secret.ts
var RE9 = /(?:^|\n)[ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|AUTH|CREDENTIAL)[A-Z0-9_]*[ \t]*=[ \t]*['"]?([^\s'"#]{8,})['"]?/gi;
var PLACEHOLDER = /^\$[{(]|^<|^your_|^changeme$|^x{3,}$|^\.{3,}$/i;
var envSecret = {
  id: "env_secret",
  label: "Secret in KEY=value",
  severity: "critical",
  defaultEnabled: true,
  scan(text) {
    const out = [];
    for (const m of text.matchAll(RE9)) {
      const value = m[1];
      if (PLACEHOLDER.test(value)) continue;
      const start = m.index + m[0].lastIndexOf(value);
      out.push({ start, end: start + value.length, match: value });
    }
    return out;
  },
  fixtures: {
    positives: [
      "API_KEY=sk_abcd1234efgh",
      'export DB_PASSWORD="s3cr3tValue1"',
      "AUTH_TOKEN=abcd1234efgh5678"
    ],
    negatives: [
      "DEBUG=true",
      "PORT=8080",
      "PASSWORD=${DB_PASSWORD}"
      // placeholder, not a real secret
    ]
  }
};

// packages/engine/src/detectors/db-connection-string.ts
var RE10 = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:[^\s:@/]+@[^\s/]+/gi;
var dbConnectionString = {
  id: "db_connection_string",
  label: "Connection string with credentials",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE10, text),
  fixtures: {
    positives: [
      "postgres://admin:s3cret@db.example.com:5432/app",
      "mongodb://user:pass@cluster0.mongodb.net",
      "redis://:password@10.0.0.1:6379"
    ],
    negatives: [
      "https://example.com/path",
      // no inline credentials
      "postgres://localhost:5432/db",
      // host:port, no user:pass@
      "just a sentence, not a url"
    ]
  }
};

// packages/engine/src/detectors/jwt.ts
var RE11 = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
var jwt = {
  id: "jwt",
  label: "JSON Web Token",
  severity: "warning",
  defaultEnabled: false,
  scan: (text) => matchAll(RE11, text),
  fixtures: {
    positives: [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "eyJ" + "a".repeat(10) + ".eyJ" + "b".repeat(10) + "." + "c".repeat(20),
      "token=eyJ0eXAiOiJKV1QifZ.eyJ1c2VyIjoiam9obiJ9.sig12345signature"
    ],
    negatives: [
      "eyJonlyonesegment",
      "not.a.jwt",
      "a normal sentence with dots. like this. one."
    ]
  }
};

// packages/engine/src/detectors/generic-high-entropy.ts
var TOKEN = /[A-Za-z0-9+/=_-]{20,}/g;
var HEX = /^[0-9a-fA-F]+$/;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var SEQUENTIAL = "abcdefghijklmnopqrstuvwxyz0123456789";
function isNoise(s) {
  if (/^\d+$/.test(s)) return true;
  if (/^(.)\1+$/.test(s)) return true;
  if (UUID.test(s)) return true;
  return SEQUENTIAL.includes(s.toLowerCase());
}
function threshold(s) {
  return HEX.test(s) ? 3 : 4.5;
}
var genericHighEntropy = {
  id: "generic_high_entropy",
  label: "High-entropy string",
  severity: "warning",
  defaultEnabled: false,
  scan: (text) => matchAll(TOKEN, text).filter((m) => !isNoise(m.match) && shannon(m.match) >= threshold(m.match)),
  fixtures: {
    positives: [
      "Z9x2Qw8pL3kF7mB1nV6cR4tY0sJ5hG2dW1eP8qA",
      "aB3dE6gH9jK2mN5pQ8rS1tV4wX7yZ0cF3hL6oR9u",
      "Kp7Lm2Qx9Rt4Vy8Zb3Nc6Wd1Sf5Gh0Jk4Pl8Mn2",
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
      // hex secret (lower per-char threshold)
    ],
    negatives: [
      "123456789012345678901234",
      // pure digits
      "aaaaaaaaaaaaaaaaaaaaaaaa",
      // single repeated char
      "014df517-39d1-4453-b7b3-9930c563627c",
      // UUID
      "abcdefghijklmnopqrstuvwx",
      // sequential run
      "abcabcabcabcabcabcabcabc"
      // low entropy, not flagged
    ]
  }
};

// packages/engine/src/detectors/internal-hostname.ts
var RE12 = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:internal|local|corp|lan|intranet)\b/gi;
var internalHostname = {
  id: "internal_hostname",
  label: "Internal hostname",
  severity: "warning",
  defaultEnabled: false,
  scan: (text) => matchAll(RE12, text),
  fixtures: {
    positives: ["db01.internal", "app.server.corp", "gateway.intranet"],
    negatives: ["example.com", "www.google.com", "just some plain text"]
  }
};

// packages/engine/src/detectors/private-ip.ts
var RE13 = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
var privateIp = {
  id: "private_ip",
  label: "Private IP address",
  severity: "warning",
  defaultEnabled: false,
  scan: (text) => matchAll(RE13, text),
  fixtures: {
    positives: ["10.0.0.5", "192.168.1.1", "172.31.255.254"],
    negatives: [
      "8.8.8.8",
      // public
      "172.32.0.1",
      // outside the private 172.16–31 range
      "no ip address in this sentence"
    ]
  }
};

// packages/engine/src/detectors/email.ts
var RE14 = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
var email = {
  id: "email",
  label: "Email address",
  severity: "warning",
  defaultEnabled: false,
  rationale: "An email address is personal data (PII) \u2014 redact it if the recipient should not see it.",
  scan: (text) => matchAll(RE14, text),
  fixtures: {
    positives: ["john.doe@example.com", "a_b+c@mail.co.uk", "user@sub.domain.org"],
    negatives: [
      "not an email address",
      "@handle-without-local-part",
      "a@b"
      // no top-level domain
    ]
  }
};

// packages/engine/src/detectors/gitlab-pat.ts
var RE15 = /\bglpat-[0-9A-Za-z_-]{20}\b/g;
var gitlabPat = {
  id: "gitlab_pat",
  label: "GitLab personal access token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE15, text),
  fixtures: {
    positives: [
      "glpat-" + "a".repeat(20),
      "GITLAB_TOKEN=glpat-A1b2C3d4E5f6G7h8I9j0",
      "glpat-xZ_-xZ_-xZ_-xZ_-xZ12"
    ],
    negatives: ["glpat-short", "glpat_" + "a".repeat(20), "not a gitlab token here"]
  }
};

// packages/engine/src/detectors/npm-token.ts
var RE16 = /\bnpm_[0-9A-Za-z]{36}\b/g;
var npmToken = {
  id: "npm_token",
  label: "npm access token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE16, text),
  fixtures: {
    positives: [
      "npm_" + "a".repeat(36),
      "//registry.npmjs.org/:_authToken=npm_" + "A1b2".repeat(9),
      "npm_" + "0123456789".repeat(3) + "abcdef"
    ],
    negatives: ["npm_short", "npm install left-pad", "just editing the npmrc"]
  }
};

// packages/engine/src/detectors/sendgrid-key.ts
var RE17 = /\bSG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}\b/g;
var sendgridKey = {
  id: "sendgrid_key",
  label: "SendGrid API key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE17, text),
  fixtures: {
    positives: [
      "SG." + "a".repeat(22) + "." + "b".repeat(43),
      "key=SG.A1b2C3d4E5f6G7h8I9j0Kl." + "M".repeat(43),
      "SG." + "x".repeat(22) + "." + "y".repeat(43)
    ],
    negatives: ["SG.tooshort.x", "SG." + "a".repeat(22), "not a sendgrid key"]
  }
};

// packages/engine/src/detectors/twilio-key.ts
var RE18 = /\bSK[0-9a-f]{32}\b/g;
var twilioKey = {
  id: "twilio_key",
  label: "Twilio API key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE18, text),
  fixtures: {
    positives: [
      "SK" + "0123456789abcdef".repeat(2),
      "twilio_key=SK" + "a".repeat(32),
      "SK" + "deadbeef".repeat(4)
    ],
    negatives: ["SKshort", "SK" + "g".repeat(32), "no twilio credentials here"]
  }
};

// packages/engine/src/detectors/google-oauth-secret.ts
var RE19 = /\bGOCSPX-[0-9A-Za-z_-]{28}\b/g;
var googleOauthSecret = {
  id: "google_oauth_secret",
  label: "Google OAuth client secret",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE19, text),
  fixtures: {
    positives: [
      "GOCSPX-" + "a".repeat(28),
      "client_secret=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",
      "GOCSPX-" + "x".repeat(28)
    ],
    negatives: ["GOCSPX-short", "GOCSPX_" + "a".repeat(28), "no google secret in here"]
  }
};

// packages/engine/src/detectors/shopify-token.ts
var RE20 = /\bshp(?:at|ca|pa|ss)_[0-9a-f]{32}\b/g;
var shopifyToken = {
  id: "shopify_token",
  label: "Shopify access token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE20, text),
  fixtures: {
    positives: [
      "shpat_" + "a".repeat(32),
      "shpss_" + "0123456789abcdef".repeat(2),
      "shpca_" + "deadbeef".repeat(4)
    ],
    negatives: ["shpat_short", "shpat_" + "g".repeat(32), "a shopify store url"]
  }
};

// packages/engine/src/detectors/huggingface-token.ts
var RE21 = /\bhf_[0-9A-Za-z]{34}\b/g;
var huggingfaceToken = {
  id: "huggingface_token",
  label: "Hugging Face token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE21, text),
  fixtures: {
    positives: ["hf_" + "a".repeat(34), "HF_TOKEN=hf_" + "A1b2".repeat(8) + "cd", "hf_" + "x".repeat(34)],
    negatives: ["hf_short", "half of the dataset", "a hugging face model card"]
  }
};

// packages/engine/src/detectors/digitalocean-token.ts
var RE22 = /\bdo[opr]_v1_[0-9a-f]{64}\b/g;
var digitaloceanToken = {
  id: "digitalocean_token",
  label: "DigitalOcean token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE22, text),
  fixtures: {
    positives: [
      "dop_v1_" + "0123456789abcdef".repeat(4),
      "dor_v1_" + "a".repeat(64),
      "doo_v1_" + "deadbeef".repeat(8)
    ],
    negatives: ["dop_v1_short", "dop_v1_" + "g".repeat(64), "a digitalocean droplet"]
  }
};

// packages/engine/src/detectors/postman-key.ts
var RE23 = /\bPMAK-[0-9a-f]{24}-[0-9a-f]{34}\b/g;
var postmanKey = {
  id: "postman_key",
  label: "Postman API key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE23, text),
  fixtures: {
    positives: [
      "PMAK-" + "a".repeat(24) + "-" + "b".repeat(34),
      "PMAK-0123456789abcdef01234567-" + "f".repeat(34),
      "key=PMAK-" + "1".repeat(24) + "-" + "2".repeat(34)
    ],
    negatives: ["PMAK-short", "PMAK-" + "g".repeat(24) + "-" + "b".repeat(34), "a postman collection"]
  }
};

// packages/engine/src/detectors/linear-key.ts
var RE24 = /\blin_api_[0-9A-Za-z]{40}\b/g;
var linearKey = {
  id: "linear_key",
  label: "Linear API key",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE24, text),
  fixtures: {
    positives: ["lin_api_" + "a".repeat(40), "lin_api_" + "A1b2".repeat(10), "lin_api_" + "0".repeat(40)],
    negatives: ["lin_api_short", "the linear app", "lin_api_ has a space"]
  }
};

// packages/engine/src/detectors/square-token.ts
var RE25 = /\bsq0(?:atp|csp)-[0-9A-Za-z_-]{22,}\b/g;
var squareToken = {
  id: "square_token",
  label: "Square access token",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE25, text),
  fixtures: {
    positives: [
      "sq0atp-" + "a".repeat(22),
      "sq0csp-A1b2C3d4E5f6G7h8I9j0Kl",
      "sq0atp-" + "x".repeat(40)
    ],
    negatives: ["sq0atp-short", "sq0xyz-" + "a".repeat(22), "a square payment link"]
  }
};

// packages/engine/src/detectors/stripe-webhook-secret.ts
var RE26 = /\bwhsec_[0-9A-Za-z]{32,}\b/g;
var stripeWebhookSecret = {
  id: "stripe_webhook_secret",
  label: "Stripe webhook secret",
  severity: "critical",
  defaultEnabled: true,
  scan: (text) => matchAll(RE26, text),
  fixtures: {
    positives: [
      "whsec_" + "a".repeat(32),
      "STRIPE_WEBHOOK_SECRET=whsec_" + "A1b2".repeat(9),
      "whsec_" + "x".repeat(40)
    ],
    negatives: ["whsec_short", "whsec_ with a space", "no webhook secret here"]
  }
};

// packages/engine/src/detectors/credit-card.ts
var CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;
var creditCard = {
  id: "credit_card",
  label: "Credit card number",
  severity: "warning",
  defaultEnabled: false,
  rationale: "A Luhn-valid card number. Sharing payment data with an AI assistant risks PCI exposure.",
  scan(text) {
    const out = [];
    for (const m of text.matchAll(CANDIDATE)) {
      const digits = m[0].replace(/[ -]/g, "");
      if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
        const start = m.index;
        out.push({ start, end: start + m[0].length, match: m[0] });
      }
    }
    return out;
  },
  fixtures: {
    positives: ["4242424242424242", "4111 1111 1111 1111", "5555-5555-5555-4444"],
    negatives: [
      "4242424242424241",
      // fails Luhn
      "4111111111111112",
      // fails Luhn
      "order 12345 placed today"
      // too short to be a card
    ]
  }
};

// packages/engine/src/detectors/iban.ts
var CANDIDATE2 = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
function mod97Valid(iban2) {
  const rearranged = iban2.slice(4) + iban2.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? code - 55 : code - 48;
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}
var iban = {
  id: "iban",
  label: "IBAN",
  severity: "warning",
  defaultEnabled: false,
  rationale: "A checksum-valid bank account number (IBAN) \u2014 treat as personal financial data.",
  scan(text) {
    const out = [];
    for (const m of text.matchAll(CANDIDATE2)) {
      if (mod97Valid(m[0])) {
        const start = m.index;
        out.push({ start, end: start + m[0].length, match: m[0] });
      }
    }
    return out;
  },
  fixtures: {
    positives: ["DE89370400440532013000", "GB82WEST12345698765432", "FR1420041010050500013M02606"],
    negatives: [
      "DE89370400440532013001",
      // fails mod-97
      "XX00NOTAREALIBANVALUE99",
      // fails mod-97
      "no iban in this sentence"
    ]
  }
};

// packages/engine/src/detectors/generated.ts
var RE_0 = new RegExp("\\b[0-9a-f]{32}-us\\d{1,2}\\b", "g");
var RE_1 = new RegExp("\\bkey-[0-9a-zA-Z]{32}\\b", "g");
var RE_2 = new RegExp("\\bNRAK-[A-Z0-9]{27}\\b", "g");
var RE_3 = new RegExp("\\bpypi-AgEI[A-Za-z0-9_-]{50,}\\b", "g");
var RE_4 = new RegExp("\\bdp\\.pt\\.[A-Za-z0-9]{43}\\b", "g");
var RE_5 = new RegExp("\\bglsa_[A-Za-z0-9]{32}_[a-f0-9]{8}\\b", "g");
var RE_6 = new RegExp("\\bdapi[0-9a-f]{32}\\b", "g");
var RE_7 = new RegExp("\\b\\d{8,10}:[A-Za-z0-9_-]{35}\\b", "g");
var RE_8 = new RegExp("\\bxkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}\\b", "g");
var RE_9 = new RegExp("\\bpscale_tkn_[A-Za-z0-9_-]{32,}\\b", "g");
var generated = [
  {
    id: "mailchimp_key",
    label: "Mailchimp API key",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_0, text),
    fixtures: { positives: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-us1", "ffffffffffffffffffffffffffffffff-us20"], negatives: ["abcd-us1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-usX", "not a mailchimp key"] }
  },
  {
    id: "mailgun_key",
    label: "Mailgun API key",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_1, text),
    fixtures: { positives: ["key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "key-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], negatives: ["key-tooshort", "a keyword here", "key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] }
  },
  {
    id: "newrelic_key",
    label: "New Relic user key",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_2, text),
    fixtures: { positives: ["NRAK-AAAAAAAAAAAAAAAAAAAAAAAAAAA", "NRAK-000000000000000000000000000"], negatives: ["NRAK-short", "nrak-AAAAAAAAAAAAAAAAAAAAAAAAAAA", "just some text"] }
  },
  {
    id: "pypi_token",
    label: "PyPI upload token",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_3, text),
    fixtures: { positives: ["pypi-AgEIaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "pypi-AgEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], negatives: ["pypi-short", "pypi-XXXXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "a pypi package"] }
  },
  {
    id: "doppler_token",
    label: "Doppler personal token",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_4, text),
    fixtures: { positives: ["dp.pt.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "dp.pt.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], negatives: ["dp.pt.short", "dp.sa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "doppler config"] }
  },
  {
    id: "grafana_token",
    label: "Grafana service account token",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_5, text),
    fixtures: { positives: ["glsa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_00000000", "glsa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_ffffffff"], negatives: ["glsa_short", "glsa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_xyz", "grafana dashboard"] }
  },
  {
    id: "databricks_token",
    label: "Databricks token",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_6, text),
    fixtures: { positives: ["dapiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "dapi00000000000000000000000000000000"], negatives: ["dapishort", "dapigggggggggggggggggggggggggggggggg", "a databricks notebook"] }
  },
  {
    id: "telegram_bot_token",
    label: "Telegram bot token",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_7, text),
    fixtures: { positives: ["111111111:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "0000000000:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], negatives: ["123:abc", "111111111:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "a telegram message"] }
  },
  {
    id: "brevo_key",
    label: "Brevo (Sendinblue) API key",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_8, text),
    fixtures: { positives: ["xkeysib-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-AAAAAAAAAAAAAAAA", "xkeysib-0000000000000000000000000000000000000000000000000000000000000000-bbbbbbbbbbbbbbbb"], negatives: ["xkeysib-short", "xkeysib-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-short", "a brevo email"] }
  },
  {
    id: "planetscale_token",
    label: "PlanetScale password token",
    severity: "critical",
    defaultEnabled: true,
    scan: (text) => matchAll(RE_9, text),
    fixtures: { positives: ["pscale_tkn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "pscale_tkn_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"], negatives: ["pscale_tkn_short", "pscale_pw_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "a planetscale db"] }
  }
];

// packages/engine/src/detectors/index.ts
var detectors = [
  awsAccessKeyId,
  awsSecretAccessKey,
  gcpKey,
  azureKey,
  githubToken,
  anthropicKey,
  openaiKey,
  slackToken,
  stripeLiveKey,
  privateKey,
  envSecret,
  dbConnectionString,
  gitlabPat,
  npmToken,
  sendgridKey,
  twilioKey,
  googleOauthSecret,
  shopifyToken,
  huggingfaceToken,
  digitaloceanToken,
  postmanKey,
  linearKey,
  squareToken,
  stripeWebhookSecret,
  jwt,
  genericHighEntropy,
  internalHostname,
  privateIp,
  email,
  creditCard,
  iban,
  ...generated
];
var detectorsById = new Map(
  detectors.map((d) => [d.id, d])
);

// packages/engine/src/detect.ts
function resolveEnabled(config) {
  if (config.enabledDetectors) return new Set(config.enabledDetectors);
  return new Set(detectors.filter((d) => d.defaultEnabled).map((d) => d.id));
}
function compileAllowlist(config) {
  const allow = config.allowlist;
  const values = new Set(allow?.values ?? []);
  const patterns = (allow?.patterns ?? []).map((p) => new RegExp(p));
  return (match) => values.has(match) || patterns.some((re) => re.test(match));
}
function sortFindings(findings) {
  return findings.sort(
    (a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type)
  );
}
var MAX_INPUT = 1e6;
function defaultRationale(severity, label) {
  return severity === "critical" ? `${label} looks like a live credential \u2014 sharing it with an AI assistant could leak access.` : `${label} may be sensitive \u2014 review before sending.`;
}
function detect(text, config = {}) {
  const scanned = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text;
  const enabled = resolveEnabled(config);
  const isAllowed = compileAllowlist(config);
  const out = [];
  for (const d of detectors) {
    if (!enabled.has(d.id)) continue;
    const severity = config.severityOverrides?.[d.id] ?? d.severity;
    for (const m of d.scan(scanned)) {
      if (isAllowed(m.match)) continue;
      out.push({
        id: `${d.id}:${m.start}:${m.end}`,
        type: d.id,
        label: d.label,
        severity,
        start: m.start,
        end: m.end,
        match: m.match,
        rationale: d.rationale ?? defaultRationale(severity, d.label)
      });
    }
  }
  return sortFindings(out);
}

// packages/engine/src/redact.ts
var severityRank = { critical: 0, warning: 1 };
function resolveOverlaps(findings) {
  const ordered = [...findings].sort(
    (a, b) => a.start - b.start || severityRank[a.severity] - severityRank[b.severity] || b.end - a.end
  );
  const kept = [];
  let lastEnd = -1;
  for (const f of ordered) {
    if (f.start < lastEnd) continue;
    kept.push(f);
    lastEnd = f.end;
  }
  return kept;
}
function redact(text, findings, opts = {}) {
  const tokenFor = opts.token ?? ((f) => `\u27E8redacted:${f.type}\u27E9`);
  let result = "";
  let cursor = 0;
  for (const f of resolveOverlaps(findings)) {
    result += text.slice(cursor, f.start) + tokenFor(f);
    cursor = f.end;
  }
  return result + text.slice(cursor);
}

// packages/engine/src/custom.ts
function customFindings(text, rules) {
  const out = [];
  const add = (start, end, match) => {
    out.push({
      id: `custom:${start}:${end}`,
      type: "custom",
      label: "Custom redaction",
      severity: "critical",
      start,
      end,
      match,
      rationale: "Matched a value you marked for redaction."
    });
  };
  for (const v of rules.values) {
    if (!v) continue;
    for (let i = text.indexOf(v); i !== -1; i = text.indexOf(v, i + v.length)) add(i, i + v.length, v);
  }
  for (const p of rules.patterns) {
    if (!p) continue;
    let re;
    try {
      re = new RegExp(p, "g");
    } catch {
      continue;
    }
    for (const m of text.matchAll(re)) if (m[0]) add(m.index, m.index + m[0].length, m[0]);
  }
  return out;
}
export {
  customFindings,
  detect,
  detectors,
  detectorsById,
  redact
};
