# open-silong MCP

Notion-canonical Model Context Protocol surface — lets Claude Desktop,
Claude Code, or any MCP-compatible client drive open-silong the same way
it drives Notion.

## Architecture

```
Claude Desktop / Claude Code
        │  (HTTP MCP / JSON-RPC)
        │  POST /mcp/v1
        ▼
convex/http.ts      ←  Mounts the route
        │
        ▼
convex/mcp/http.ts  ←  Tool dispatcher + Bearer-token auth
        │
        ├──→ convex/mcp/internal.ts  (internalQuery / internalMutation)
        │
        └──→ convex/_shared/notionShape.ts  (JSON shape adapter)
                  │
                  ▼
              docs/api/notion-shape.md
```

Two layers:

1. **HTTPS endpoint `/mcp/v1`** (`convex/mcp/http.ts`) — single POST
   accepts `{tool, params}`, returns `{ok, data | error}`. Bearer
   token auth.
2. **JSON-RPC surface** (`convex/mcp/jsonrpc.ts`) — `tools/list` +
   `tools/call` over the same endpoint, for MCP clients that speak
   JSON-RPC directly.

Both layers are in-repo Convex HTTP routes. `curl` against `/mcp/v1`
works for ad-hoc scripting.

## Tool catalog

| name | purpose | required params |
|---|---|---|
| `nosion-search` | Full-text search across pages | `query` |
| `nosion-list-pages` | List pages, cursor pagination | — |
| `nosion-list-databases` | List all databases | — |
| `nosion-fetch` | Fetch any page (with blocks) or database by id | `id` |
| `nosion-list-rows` | List rows of a database | `database_id` |
| `nosion-create-page` | Create page; `children` is Notion-shape blocks array | — |
| `nosion-update-page` | Patch title/icon/cover/children | `page_id` |
| `nosion-move-page` | Reparent | `page_id` |
| `nosion-trash-page` | Soft-delete | `page_id` |
| `nosion-duplicate-page` | Deep-clone with fresh ids | `page_id` |
| `nosion-create-database` | Create db (defaults to single Title column) | — |
| `nosion-update-database` | Patch db title/icon/properties | `database_id` |
| `nosion-create-row` | Insert row; `properties` is Notion-shape envelope map | `database_id` |
| `nosion-update-row` | Patch row properties (partial merge) | `page_id` |

Tool discovery is served over JSON-RPC `tools/list` from the client
catalog (`convex/mcp/jsonrpc.ts:98` — `TOOLS`, JSON Schema).

## Wire format

Every response wraps the payload:

```json
{ "ok": true, "data": <Notion-shape JSON> }
```

Errors:

```json
{ "ok": false, "error": { "message": "Invalid token" } }
```

The `data` shape mirrors Notion's API:

- **page** — `{object:"page", id, created_time, last_edited_time, parent, archived, icon, cover, properties:{title:{...}, ...}}`
- **page (with blocks)** — adds `blocks: NotionBlock[]`
- **database** — `{object:"database", id, title:[...], properties:{name → schema entry}}`
- **list** — `{object:"list", results:[...], has_more, next_cursor}`

See `docs/api/notion-shape.md` for the per-shape conversion rules.

## Auth model

Single shared token (single-tenant cut):

```env
# convex deployment
MCP_API_KEY=<long random string>   # MCP_API_TOKEN still accepted as a fallback
MCP_USER_ID=<convex users._id this token represents>
```

This env pair is the **single-tenant fallback**; every request under it
is performed as `MCP_USER_ID`. **Per-user tokens ship today** — the
`mcpTokens` table (`convex/schema.ts:477`) stores hashed, scoped tokens
with last-used timestamps; issue and revoke them from Settings
(`convex/mcp/tokens.ts`).

## Rate limits

The MCP layer does **not** apply Convex's UI rate limits — those run
inside the public mutations (`pages.create`, `databases.addRow`,
etc.). The MCP internal mutations are separate (`mcp/internal.ts`)
and intentionally unlimited so an LLM agent can batch.

If MCP traffic becomes a concern, add `RATE_LIMITS.mcpDispatch` to
`_shared/limits.ts` and call `rateLimit(ctx, userId, ...)` at the
top of `mcpHandler`.

## Curl recipes

```bash
# Search
curl $CONVEX_SITE_URL/mcp/v1 \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"tool":"nosion-search","params":{"query":"meeting notes"}}'

# Create a page
curl $CONVEX_SITE_URL/mcp/v1 \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "tool":"nosion-create-page",
    "params":{
      "parent_id": null,
      "title": "Hello from MCP",
      "icon": "👋",
      "children": [
        { "object":"block", "type":"paragraph",
          "paragraph": { "rich_text": [
            { "type":"text", "text":{"content":"This is a paragraph"},
              "annotations":{"bold":false,"italic":false,"strikethrough":false,"underline":false,"code":false,"color":"default"} }
          ]} }
      ]
    }
  }'

# Insert a row in a database
curl $CONVEX_SITE_URL/mcp/v1 \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "tool":"nosion-create-row",
    "params":{
      "database_id":"<dbId>",
      "properties":{
        "Name": { "type":"title", "title":[{"type":"text","text":{"content":"New row"},"plain_text":"New row","annotations":{"bold":false,"italic":false,"strikethrough":false,"underline":false,"code":false,"color":"default"},"href":null}] },
        "Status": { "type":"select", "select":{ "id":"opt1" } }
      }
    }
  }'
```

## Roadmap

- **Comments** (`nosion-create-comment`, `nosion-get-comments`) — the
  comments backend ships; the MCP tools are not written yet.
- **Users / teams** (`nosion-get-users`) — multi-workspace membership
  ships; the MCP tools are not written yet.
- **Database schema PATCH** via `properties` MAP (not array) on
  `nosion-update-database`.
- **`nosion-create-view` / `nosion-update-view`** — view CRUD.
- **Streaming** — long fetches (full-tree dump) over Server-Sent
  Events instead of single-shot.
