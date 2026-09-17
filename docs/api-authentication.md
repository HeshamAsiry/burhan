# API Authentication

Burhan v1 protects all `/api/v1/*` endpoints except:

- `GET /api/v1/health`

The API key is configured on the server as:

```
BURHAN_API_KEY=...
```

Clients send either:

```
Authorization: Bearer <BURHAN_API_KEY>
```

or:

```
x-burhan-api-key: <BURHAN_API_KEY>
```

Do not expose the key in browser bundles or public source code.

If `BURHAN_API_KEY` is missing in the deployed environment, protected endpoints return `503 API_KEY_NOT_CONFIGURED`.

This is the initial protection layer. The next production step is moving from one shared key to per-client hashed API keys with quotas and rate limits.
