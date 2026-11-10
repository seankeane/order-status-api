// Order Status API - simple demo REST service intended to be exposed as MCP tools via MuleSoft MCP Bridge.
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || ""; // when set, requests must send header x-api-key
const OPENAPI = fs.readFileSync(path.join(__dirname, "openapi.json"), "utf8");

const orders = [
  { orderNumber: "ORD-1001", customerEmail: "jane.doe@example.com", status: "Shipped", orderDate: "2025-10-28", total: 149.97, currency: "USD", carrier: "UPS", trackingNumber: "1Z999AA10123456784", estimatedDelivery: "2025-11-12", items: [{ sku: "TRL-SHOE-42", name: "Trail Running Shoes", quantity: 1, price: 119.99 }, { sku: "SOCK-3PK", name: "Performance Socks (3 pack)", quantity: 1, price: 29.98 }] },
  { orderNumber: "ORD-1002", customerEmail: "jane.doe@example.com", status: "Delivered", orderDate: "2025-10-02", total: 59.0, currency: "USD", carrier: "FedEx", trackingNumber: "786543210987", estimatedDelivery: "2025-10-07", items: [{ sku: "BTL-750", name: "Insulated Water Bottle", quantity: 2, price: 29.5 }] },
  { orderNumber: "ORD-1003", customerEmail: "sam.lee@example.com", status: "Processing", orderDate: "2025-11-08", total: 249.0, currency: "USD", carrier: null, trackingNumber: null, estimatedDelivery: "2025-11-15", items: [{ sku: "JKT-RAIN-M", name: "Waterproof Rain Jacket", quantity: 1, price: 249.0 }] },
  { orderNumber: "ORD-1004", customerEmail: "sam.lee@example.com", status: "Cancelled", orderDate: "2025-09-20", total: 35.0, currency: "USD", carrier: null, trackingNumber: null, estimatedDelivery: null, items: [{ sku: "CAP-RUN", name: "Running Cap", quantity: 1, price: 35.0 }] },
  { orderNumber: "ORD-1005", customerEmail: "alex.morgan@example.com", status: "Delivered", orderDate: "2025-10-15", total: 89.99, currency: "USD", carrier: "USPS", trackingNumber: "9400111899223197428490", estimatedDelivery: "2025-10-19", items: [{ sku: "PACK-20L", name: "Daypack 20L", quantity: 1, price: 89.99 }] }
];
const returns = [];
const RETURN_REASONS = ["Damaged", "Wrong Item", "Wrong Size", "Not As Described", "Changed Mind", "Other"];

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
const error = (res, status, code, message) => send(res, status, { error: code, message });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON body")); } });
  });
}

const summary = (o) => ({ orderNumber: o.orderNumber, status: o.status, orderDate: o.orderDate, total: o.total, currency: o.currency, itemCount: o.items.reduce((n, i) => n + i.quantity, 0) });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname.replace(/\/+$/, "") || "/";
  console.log(new Date().toISOString(), req.method, req.url);

  if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
  if (p === "/" || p === "/health") return send(res, 200, { status: "ok", service: "order-status-api", version: "1.0.0" });
  if (p === "/openapi.json") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    return res.end(OPENAPI);
  }

  if (API_KEY && req.headers["x-api-key"] !== API_KEY) return error(res, 401, "unauthorized", "Missing or invalid x-api-key header");

  // GET /orders?email=  -> listCustomerOrders
  if (req.method === "GET" && p === "/orders") {
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email) return error(res, 400, "bad_request", "Query parameter 'email' is required");
    const list = orders.filter((o) => o.customerEmail === email).map(summary);
    return send(res, 200, { customerEmail: email, count: list.length, orders: list });
  }

  // GET /orders/{orderNumber} -> getOrderStatus
  let m = p.match(/^\/orders\/([^/]+)$/);
  if (req.method === "GET" && m) {
    const o = orders.find((x) => x.orderNumber.toLowerCase() === decodeURIComponent(m[1]).toLowerCase());
    if (!o) return error(res, 404, "not_found", `Order ${m[1]} not found`);
    return send(res, 200, { ...o, returns: returns.filter((r) => r.orderNumber === o.orderNumber) });
  }

  // POST /orders/{orderNumber}/returns -> createReturnRequest
  m = p.match(/^\/orders\/([^/]+)\/returns$/);
  if (req.method === "POST" && m) {
    const o = orders.find((x) => x.orderNumber.toLowerCase() === decodeURIComponent(m[1]).toLowerCase());
    if (!o) return error(res, 404, "not_found", `Order ${m[1]} not found`);
    let body;
    try { body = await readJson(req); } catch (e) { return error(res, 400, "bad_request", e.message); }
    const reason = body.reason || "Other";
    if (!RETURN_REASONS.includes(reason)) return error(res, 400, "bad_request", `reason must be one of: ${RETURN_REASONS.join(", ")}`);
    if (o.status !== "Delivered") return error(res, 409, "not_eligible", `Order ${o.orderNumber} has status '${o.status}'; only Delivered orders can be returned`);
    const skus = Array.isArray(body.skus) && body.skus.length ? body.skus : o.items.map((i) => i.sku);
    const bad = skus.filter((s) => !o.items.some((i) => i.sku === s));
    if (bad.length) return error(res, 400, "bad_request", `SKUs not on order: ${bad.join(", ")}`);
    const r = { returnId: "RMA-" + crypto.randomBytes(3).toString("hex").toUpperCase(), orderNumber: o.orderNumber, status: "Requested", reason, comments: body.comments || "", skus, refundAmount: o.items.filter((i) => skus.includes(i.sku)).reduce((t, i) => t + i.price * i.quantity, 0), createdAt: new Date().toISOString(), instructions: "A prepaid return label will be emailed to the customer within 24 hours." };
    returns.push(r);
    return send(res, 201, r);
  }

  error(res, 404, "not_found", `No route for ${req.method} ${p}`);
});

server.listen(PORT, () => console.log(`order-status-api listening on ${PORT}`));
