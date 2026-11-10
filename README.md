# Order Status API

Demo REST service (no dependencies, Node 18+) designed to be fronted by MuleSoft Flex Gateway and exposed to Agentforce as MCP tools via MCP Bridge.

| Operation (MCP tool) | Method & path | Purpose |
|---|---|---|
| `getOrderStatus` | `GET /orders/{orderNumber}` | Status, items, tracking, returns for one order |
| `listCustomerOrders` | `GET /orders?email=` | All orders for a customer email |
| `createReturnRequest` | `POST /orders/{orderNumber}/returns` | Create an RMA for a Delivered order |

Also: `GET /health`, `GET /openapi.json` (OpenAPI 3.0 spec, public).

## Auth
Set env var `API_KEY` to require header `x-api-key` on the order endpoints.

## Sample data
`jane.doe@example.com` (ORD-1001 Shipped, ORD-1002 Delivered), `sam.lee@example.com` (ORD-1003 Processing, ORD-1004 Cancelled), `alex.morgan@example.com` (ORD-1005 Delivered). Returns are stored in memory and reset on restart.

## Run
```
npm start   # PORT defaults to 3000
```
