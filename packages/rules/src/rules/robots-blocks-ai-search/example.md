```robots.txt wrong
# Keep ChatGPT search out
User-agent: OAI-SearchBot
Disallow: /
```

```robots.txt right
# No model training on our content
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /
```
