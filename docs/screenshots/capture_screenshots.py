#!/usr/bin/env python3
"""
Browser smoke test + screenshot capture for the StockPilot frontend.

IMPORTANT: this does NOT exercise the Java backend. It runs the built frontend in headless Chromium and answers
`http://localhost:8080/api/**` with a small stand-in API (Playwright request interception) that serves REAL rows
from a PostgreSQL database loaded with the project's migrations + demo seed. It exists to (1) prove every page renders
and the main flows work in a real browser without runtime errors, and (2) produce README screenshots.

Usage (from the repo root, with the frontend built and a seeded database reachable via PG_DSN):
    cd frontend && npm run build && npx vite preview --port 4173 &
    PG_DSN="host=/path/to/socket dbname=sp_test user=postgres" python docs/screenshots/capture_screenshots.py
"""
import json
import os
import re
import sys
import datetime as dt
from decimal import Decimal
from urllib.parse import urlparse, parse_qs

import psycopg2
import psycopg2.extras
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP_URL", "http://localhost:4173")
API = "http://localhost:8080"
OUT = os.path.dirname(os.path.abspath(__file__))
conn = psycopg2.connect(os.environ["PG_DSN"])
conn.autocommit = True

USERS = {
    "admin": dict(id=1, username="admin", fullName="Ava Administrator", email="admin@stockpilot.demo", role="ADMIN", pw="Admin@12345"),
    "manager": dict(id=2, username="manager", fullName="Marcus Manager", email="manager@stockpilot.demo", role="MANAGER", pw="Manager@12345"),
    "cashier": dict(id=3, username="cashier", fullName="Chloe Cashier", email="cashier@stockpilot.demo", role="CASHIER", pw="Cashier@12345"),
}


def jsonable(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (dt.datetime, dt.date)):
        return o.isoformat()
    raise TypeError(type(o))


def q(sql, params=()):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def one(sql, params=()):
    rows = q(sql, params)
    return rows[0] if rows else None


def page(rows, total, pg, size):
    return dict(content=rows, totalElements=total, totalPages=max(1, -(-total // size)) if total else 0, number=pg, size=size)


def status_of(qty, mn):
    return "OUT_OF_STOCK" if qty <= 0 else "LOW_STOCK" if qty <= mn else "IN_STOCK"


PRODUCT_SQL = """select p.id, p.sku, p.barcode, p.name, p.description, p.category_id as "categoryId", c.name as "categoryName",
  p.supplier_id as "supplierId", s.name as "supplierName", p.cost_price as "costPrice", p.selling_price as "sellingPrice",
  i.quantity, p.min_stock as "minStock", p.image_url as "imageUrl", p.active, p.created_at as "createdAt", p.updated_at as "updatedAt"
  from products p left join categories c on c.id=p.category_id left join suppliers s on s.id=p.supplier_id
  join inventory i on i.product_id=p.id"""


def shape_product(r, cost=True):
    r = dict(r)
    r["stockStatus"] = status_of(r["quantity"], r["minStock"])
    if not cost:
        r["costPrice"] = None
    return r


def sale_summaries(where="", params=(), limit=15, offset=0):
    return q(f"""select s.id, s.receipt_number as "receiptNumber", s.status, u.full_name as "cashierName", s.total,
      coalesce((select sum(quantity) from sale_items si where si.sale_id=s.id),0)::int as "itemCount",
      (select method from payments p where p.sale_id=s.id order by id limit 1) as "paymentMethod", s.created_at as "createdAt"
      from sales s join users u on u.id=s.cashier_id {where} order by s.created_at desc limit %s offset %s""", (*params, limit, offset))


def sale_detail(sid, cost=True):
    s = one("""select s.*, u.full_name as cashier_name, r.full_name as reversed_by_name from sales s join users u on u.id=s.cashier_id
      left join users r on r.id=s.reversed_by where s.id=%s""", (sid,))
    if not s:
        return None
    items = q("select product_id as \"productId\", product_name as \"productName\", sku, quantity, unit_price as \"unitPrice\", line_total as \"lineTotal\" from sale_items where sale_id=%s order by id", (sid,))
    pays = q("select method, amount, reference from payments where sale_id=%s order by id", (sid,))
    return dict(id=s["id"], receiptNumber=s["receipt_number"], status=s["status"], cashierId=s["cashier_id"], cashierName=s["cashier_name"],
                subtotal=s["subtotal"], discountAmount=s["discount_amount"], total=s["total"], cogs=s["cogs"] if cost else None,
                items=items, payments=pays, reversalReason=s["reversal_reason"], reversedBy=s["reversed_by_name"],
                reversedAt=s["reversed_at"], createdAt=s["created_at"])


def purchases(where="", params=()):
    rows = q(f"""select p.*, s.name as supplier_name, cb.full_name as cb, ab.full_name as ab, rb.full_name as rb from purchases p
      join suppliers s on s.id=p.supplier_id join users cb on cb.id=p.created_by left join users ab on ab.id=p.approved_by
      left join users rb on rb.id=p.received_by {where} order by p.created_at desc""", params)
    out = []
    for p in rows:
        items = q("""select pi.product_id as "productId", pr.name as "productName", pr.sku, pi.quantity, pi.unit_cost as "unitCost",
          round(pi.quantity*pi.unit_cost,2) as "lineTotal" from purchase_items pi join products pr on pr.id=pi.product_id where pi.purchase_id=%s order by pi.id""", (p["id"],))
        out.append(dict(id=p["id"], poNumber=p["po_number"], supplierId=p["supplier_id"], supplierName=p["supplier_name"], status=p["status"],
                        notes=p["notes"], totalCost=p["total_cost"], createdBy=p["cb"], approvedBy=p["ab"], receivedBy=p["rb"],
                        receivedAt=p["received_at"], createdAt=p["created_at"], items=items))
    return out


def totals(status, frm=None, to=None):
    r = one("select count(*) c, coalesce(sum(total),0) rev, coalesce(sum(cogs),0) cogs from sales where status=%s "
            "and (%s::timestamptz is null or created_at>=%s) and (%s::timestamptz is null or created_at<%s)", (status, frm, frm, to, to))
    return dict(count=r["c"], revenue=r["rev"], cogs=r["cogs"], grossProfit=r["rev"] - r["cogs"])


def buckets(grain, frm=None, to=None):
    unit = {"day": "day", "week": "week", "month": "month", "year": "year"}[grain]
    rows = q(f"""select to_char(date_trunc('{unit}', created_at at time zone 'UTC'),'YYYY-MM-DD') period, count(*)::int count,
      coalesce(sum(total),0) revenue, coalesce(sum(cogs),0) cogs from sales where status='COMPLETED'
      and (%s::timestamptz is null or created_at>=%s) and (%s::timestamptz is null or created_at<%s) group by 1 order by 1""", (frm, frm, to, to))
    for r in rows:
        r["grossProfit"] = r["revenue"] - r["cogs"]
    return rows


def day_start(s, add=0):
    d = dt.date.fromisoformat(s) + dt.timedelta(days=add)
    return dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc)


def best_sellers(frm=None, to=None, limit=10):
    return q("""select si.product_id as "productId", si.product_name as name, si.sku, sum(si.quantity)::int as "unitsSold", sum(si.line_total) as revenue
      from sale_items si join sales s on s.id=si.sale_id where s.status='COMPLETED' and (%s::timestamptz is null or s.created_at>=%s)
      and (%s::timestamptz is null or s.created_at<%s) group by 1,2,3 order by 4 desc, 5 desc limit %s""", (frm, frm, to, to, limit))


def dashboard(frm, to):
    today = dt.date.today()
    frm = frm or str(today - dt.timedelta(days=29))
    to = to or str(today)
    f, t = day_start(frm), day_start(to, 1)
    trend = {b["period"]: b for b in buckets("day", f, t)}
    days, d = [], dt.date.fromisoformat(frm)
    while d <= dt.date.fromisoformat(to):
        days.append(trend.get(str(d), dict(period=str(d), count=0, revenue=0, cogs=0, grossProfit=0)))
        d += dt.timedelta(days=1)
    low = [shape_product(r) for r in q(PRODUCT_SQL + " where p.active and i.quantity<=p.min_stock order by i.quantity, p.name")]
    st = one("""select count(*) filter (where i.quantity>p.min_stock) ok, count(*) filter (where i.quantity>0 and i.quantity<=p.min_stock) low,
      count(*) filter (where i.quantity=0) oos from inventory i join products p on p.id=i.product_id where p.active""")
    td, ms = totals("COMPLETED", day_start(str(today)), day_start(str(today), 1)), totals("COMPLETED", day_start(str(today.replace(day=1))), day_start(str(today), 1))
    return dict(from_=frm, to=to, totalProducts=one("select count(*) c from products where active")["c"],
                inventoryValue=one("select coalesce(sum(i.quantity*p.cost_price),0) v from inventory i join products p on p.id=i.product_id where p.active")["v"],
                salesToday=dict(count=td["count"], revenue=td["revenue"]), monthToDate=dict(count=ms["count"], revenue=ms["revenue"]),
                lowStockCount=len(low), lowStock=low[:8], recentTransactions=sale_summaries(limit=10), salesTrend=days,
                topProducts=best_sellers(f, t, 5), inventoryStatus=dict(inStock=st["ok"], lowStock=st["low"], outOfStock=st["oos"]),
                periodTotals=totals("COMPLETED", f, t))


CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,accept",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"}


def handle(route, request):
    if request.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    url = urlparse(request.url)
    path, qs = url.path, {k: v[0] for k, v in parse_qs(url.query).items()}
    auth = request.headers.get("authorization", "")
    user = next((u for u in USERS.values() if auth == f"Bearer stub-{u['username']}"), None)
    cost = bool(user and user["role"] != "CASHIER")

    def ok(body, status=200):
        route.fulfill(status=status, headers={**CORS, "content-type": "application/json"}, body=json.dumps(body, default=jsonable))

    def err(status, msg):
        ok(dict(timestamp=dt.datetime.now(dt.timezone.utc).isoformat(), status=status, error="Error", message=msg, path=path), status)

    m, body = request.method, (json.loads(request.post_data) if request.post_data else {})
    if path == "/api/auth/login":
        u = USERS.get(str(body.get("username", "")).lower())
        if not u or u["pw"] != body.get("password"):
            return err(401, "Invalid username or password")
        s = {k: u[k] for k in ("id", "username", "fullName", "email", "role")}
        return ok(dict(token=f"stub-{u['username']}", expiresAt=(dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)).isoformat(),
                       user={**s, "mustChangePassword": False}))
    if not user:
        return err(401, "Authentication is required")
    if path == "/api/auth/me":
        return ok({**{k: user[k] for k in ("id", "username", "fullName", "email", "role")}, "mustChangePassword": False})
    if path == "/api/auth/logout":
        return route.fulfill(status=204, headers=CORS)
    if path == "/api/dashboard":
        d = dashboard(qs.get("from"), qs.get("to"))
        d["from"] = d.pop("from_")
        return ok(d)
    if path == "/api/products" and m == "GET":
        pg, size = int(qs.get("page", 0)), int(qs.get("size", 20))
        where, params = ["p.active" if not (qs.get("includeArchived") == "true" and cost) else "true"], []
        if qs.get("q"):
            where.append("(lower(p.name) like %s or lower(p.sku) like %s or lower(coalesce(p.barcode,'')) like %s)")
            params += [f"%{qs['q'].lower()}%"] * 3
        if qs.get("categoryId"):
            where.append("p.category_id=%s"); params.append(int(qs["categoryId"]))
        sort_key, _, sort_dir = qs.get("sort", "name,asc").partition(",")
        col = {"name": "p.name", "sku": "p.sku", "sellingPrice": "p.selling_price"}.get(sort_key, "p.name")
        w = " where " + " and ".join(where)
        total = one(f"select count(*) c from products p {w}", params)["c"]
        rows = q(f"{PRODUCT_SQL}{w} order by {col} {'desc' if sort_dir == 'desc' else 'asc'} limit %s offset %s", (*params, size, pg * size))
        return ok(page([shape_product(r, cost) for r in rows], total, pg, size))
    if path == "/api/categories":
        return ok(q("select id, name, description from categories order by name"))
    if path == "/api/suppliers" and m == "GET":
        return ok(q('select id, name, contact_name as "contactName", email, phone, address, active, created_at as "createdAt" from suppliers order by name'))
    if m_ := re.fullmatch(r"/api/suppliers/(\d+)/products", path):
        return ok([shape_product(r) for r in q(PRODUCT_SQL + " where p.supplier_id=%s order by p.name", (int(m_[1]),))])
    if m_ := re.fullmatch(r"/api/suppliers/(\d+)/purchases", path):
        return ok(purchases("where p.supplier_id=%s", (int(m_[1]),)))
    if path in ("/api/inventory/low-stock", "/api/reports/low-stock"):
        return ok([shape_product(r) for r in q(PRODUCT_SQL + " where p.active and i.quantity<=p.min_stock order by i.quantity, p.name")])
    if path == "/api/inventory/movements":
        pg, size = int(qs.get("page", 0)), int(qs.get("size", 25))
        rows = q("""select m.id, m.product_id as "productId", p.name as "productName", p.sku, m.type, m.quantity_change as "quantityChange",
          m.quantity_after as "quantityAfter", m.unit_cost as "unitCost", m.reason, m.reference_type as "referenceType",
          m.reference_id as "referenceId", u.full_name as "createdBy", m.created_at as "createdAt" from stock_movements m
          join products p on p.id=m.product_id left join users u on u.id=m.created_by
          where (%s::text is null or m.product_id=%s::bigint) and (%s::text is null or m.type=%s) order by m.created_at desc, m.id desc limit %s offset %s""",
                 (qs.get("productId"), qs.get("productId"), qs.get("type"), qs.get("type"), size, pg * size))
        total = one("select count(*) c from stock_movements m where (%s::text is null or m.product_id=%s::bigint) and (%s::text is null or m.type=%s)",
                    (qs.get("productId"), qs.get("productId"), qs.get("type"), qs.get("type")))["c"]
        return ok(page(rows, total, pg, size))
    if path == "/api/reports/inventory-valuation":
        rows = q("""select p.id as "productId", p.sku, p.name, c.name as category, i.quantity, p.cost_price as "unitCost",
          round(i.quantity*p.cost_price,2) as "costValue", round(i.quantity*p.selling_price,2) as "retailValue"
          from products p join inventory i on i.product_id=p.id left join categories c on c.id=p.category_id where p.active order by p.name""")
        return ok(dict(rows=rows, totalCostValue=sum(r["costValue"] for r in rows), totalRetailValue=sum(r["retailValue"] for r in rows)))
    if path == "/api/reports/sales":
        f = day_start(qs["from"]) if qs.get("from") else None
        t = day_start(qs["to"], 1) if qs.get("to") else None
        b = buckets(qs.get("grain", "day"), f, t)
        rev, cg = sum(x["revenue"] for x in b), sum(x["cogs"] for x in b)
        return ok(dict(grain=qs.get("grain", "day"), from_=qs.get("from"), to=qs.get("to"), buckets=b,
                       totals=dict(count=sum(x["count"] for x in b), revenue=rev, cogs=cg, grossProfit=rev - cg)) | {"from": qs.get("from")})
    if path == "/api/reports/best-selling":
        return ok(best_sellers(day_start(qs["from"]) if qs.get("from") else None, day_start(qs["to"], 1) if qs.get("to") else None, int(qs.get("limit", 10))))
    if path == "/api/reports/revenue-overview":
        f = day_start(qs["from"]) if qs.get("from") else None
        t = day_start(qs["to"], 1) if qs.get("to") else None
        c, v, r = totals("COMPLETED", f, t), totals("VOIDED", f, t), totals("REFUNDED", f, t)
        return ok(dict(**{"from": qs.get("from")}, to=qs.get("to"), completed=c, grossMarginPercent=round(float((c["revenue"] - c["cogs"]) * 100 / c["revenue"]), 1) if c["revenue"] else 0,
                       voidedCount=v["count"], voidedAmount=v["revenue"], refundedCount=r["count"], refundedAmount=r["revenue"], purchaseSpend=0))
    if path == "/api/reports/purchases":
        ps = purchases()
        return ok(dict(**{"from": qs.get("from")}, to=qs.get("to"), purchases=ps, totalOrdered=sum(p["totalCost"] for p in ps if p["status"] != "CANCELLED"),
                       totalReceived=sum(p["totalCost"] for p in ps if p["status"] == "RECEIVED")))
    if path == "/api/sales" and m == "GET":
        pg, size = int(qs.get("page", 0)), int(qs.get("size", 20))
        where, params = [], []
        if user["role"] == "CASHIER":
            where.append("s.cashier_id=%s"); params.append(user["id"])
        if qs.get("receipt"):
            where.append("lower(s.receipt_number) like %s"); params.append(f"%{qs['receipt'].lower()}%")
        if qs.get("status"):
            where.append("s.status=%s"); params.append(qs["status"])
        w = (" where " + " and ".join(where)) if where else ""
        total = one(f"select count(*) c from sales s {w}", params)["c"]
        return ok(page(sale_summaries(w, params, size, pg * size), total, pg, size))
    if m_ := re.fullmatch(r"/api/sales/(\d+)", path):
        s = sale_detail(int(m_[1]), cost)
        return ok(s) if s else err(404, "Sale not found")
    if path == "/api/sales" and m == "POST":      # stand-in checkout: prices from the DB, nothing is persisted
        items, sub = [], Decimal(0)
        for it in body["items"]:
            p = one("select id, name, sku, selling_price from products where id=%s", (it["productId"],))
            lt = p["selling_price"] * it["quantity"]
            sub += lt
            items.append(dict(productId=p["id"], productName=p["name"], sku=p["sku"], quantity=it["quantity"], unitPrice=p["selling_price"], lineTotal=lt))
        disc = Decimal(str(body.get("discountAmount") or 0))
        return ok(dict(id=9999, receiptNumber=f"SP-{dt.date.today():%Y%m%d}-1001", status="COMPLETED", cashierId=user["id"], cashierName=user["fullName"],
                       subtotal=sub, discountAmount=disc, total=sub - disc, cogs=None, items=items,
                       payments=[dict(method=body["paymentMethod"], amount=sub - disc, reference=body.get("paymentReference"))],
                       reversalReason=None, reversedBy=None, reversedAt=None, createdAt=dt.datetime.now(dt.timezone.utc).isoformat()), 201)
    if path == "/api/purchases":
        ps = purchases()
        return ok(page(ps, len(ps), 0, 15))
    if m_ := re.fullmatch(r"/api/purchases/(\d+)", path):
        return ok(purchases("where p.id=%s", (int(m_[1]),))[0])
    if path == "/api/users":
        return ok(q('select id, username, email, full_name as "fullName", role, active, must_change_password as "mustChangePassword", last_login_at as "lastLoginAt", created_at as "createdAt" from users order by full_name'))
    if path == "/api/audit-logs":
        pg, size = int(qs.get("page", 0)), int(qs.get("size", 25))
        rows = q('select id, user_id as "userId", username, action, entity_type as "entityType", entity_id as "entityId", details, ip_address as "ipAddress", created_at as "createdAt" from audit_logs order by created_at desc limit %s offset %s', (size, pg * size))
        return ok(page(rows, one("select count(*) c from audit_logs")["c"], pg, size))
    return err(404, f"stand-in API has no route for {m} {path}")


def main():
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        def new_page(width=1440, height=900, dark=False):
            ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme="dark" if dark else "light")
            pg = ctx.new_page()
            pg.route(f"{API}/**", handle)
            pg.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
            pg.on("console", lambda msg: msg.type == "error" and problems.append(f"console.error: {msg.text}"))
            return pg

        def login(pg, who):
            pg.goto(f"{APP}/login")
            pg.get_by_label("Username").fill(who)
            pg.get_by_label("Password", exact=True).fill(USERS[who]["pw"])
            pg.get_by_role("button", name="Sign in").click()

        def shot(pg, name):
            pg.wait_for_timeout(2000)   # let chart animations finish
            pg.screenshot(path=os.path.join(OUT, f"{name}.png"))
            print("captured", name)

        # --- login page + failed login
        pg = new_page()
        pg.goto(f"{APP}/login")
        shot(pg, "login")
        pg.get_by_label("Username").fill("admin")
        pg.get_by_label("Password", exact=True).fill("wrong-password-1")
        pg.get_by_role("button", name="Sign in").click()
        pg.get_by_role("alert").wait_for()
        assert "Invalid username or password" in pg.get_by_role("alert").inner_text(), "failed login message missing"

        # --- manager walk-through
        pg = new_page()
        login(pg, "manager")
        pg.get_by_text("Total products").wait_for()
        pg.wait_for_selector("svg.recharts-surface")
        shot(pg, "dashboard-light")
        for link, heading, name in [("Products", "Products", "products"), ("Inventory", "Inventory", "inventory"),
                                    ("Sales", "Sales", "sales"), ("Purchase Orders", "Purchase orders", "purchases"),
                                    ("Suppliers", "Suppliers", "suppliers"), ("Reports", "Reports", "reports")]:
            pg.get_by_role("link", name=link, exact=True).click()
            pg.get_by_role("heading", name=heading, exact=True).wait_for()
            pg.wait_for_selector("table, [role=alert]")
            if name == "reports":
                pg.wait_for_selector("svg.recharts-surface")
            shot(pg, name)
        # sale detail + receipt
        pg.get_by_role("link", name="Sales", exact=True).click()
        pg.wait_for_selector("table tbody tr")
        pg.locator("table tbody tr").first.click()
        pg.get_by_text("Sales receipt").wait_for()
        shot(pg, "sale-receipt")
        pg.keyboard.press("Escape")
        # product edit modal + validation
        pg.get_by_role("link", name="Products", exact=True).click()
        pg.get_by_role("button", name="Add product").click()
        pg.get_by_role("button", name="Create product").click()
        pg.get_by_text("SKU is required").wait_for()
        shot(pg, "product-form-validation")
        pg.keyboard.press("Escape")
        # reports tabs
        pg.get_by_role("link", name="Reports", exact=True).click()
        for tab in ["Best sellers", "Revenue overview", "Low stock", "Inventory valuation", "Purchases"]:
            pg.get_by_role("tab", name=tab).click()
            pg.wait_for_timeout(300)
        shot(pg, "reports-purchases-tab")
        # dark theme
        pg.get_by_role("link", name="Dashboard", exact=True).click()
        pg.get_by_role("button", name=re.compile("Switch to dark theme")).click()
        pg.wait_for_selector("svg.recharts-surface")
        shot(pg, "dashboard-dark")
        # manager must not see admin pages in the menu; direct URL is bounced
        assert pg.get_by_role("link", name="Employees").count() == 0, "manager can see Employees menu"
        pg.goto(f"{APP}/employees")
        pg.get_by_text("don't have access").wait_for()

        # --- cashier: POS flow
        pg = new_page()
        login(pg, "cashier")
        pg.get_by_role("heading", name="Point of Sale").wait_for()
        assert pg.get_by_role("link", name="Dashboard").count() == 0, "cashier can see Dashboard menu"
        pg.get_by_role("button", name=re.compile(r"^Add .* to cart$")).first.click()
        pg.get_by_role("button", name=re.compile(r"^Add .* to cart$")).nth(1).click()
        pg.get_by_role("button", name=re.compile(r"^Add .* to cart$")).nth(1).click()
        subtotal = float(pg.locator("dt", has_text="Subtotal").locator("xpath=following-sibling::dd").inner_text().replace("$", "").replace(",", ""))
        pg.get_by_label("Discount ($)").fill(str(round(subtotal * 5, 2)))               # more than the whole sale
        pg.get_by_text("Discount cannot exceed the subtotal").wait_for()
        pg.get_by_label("Discount ($)").fill(str(round(subtotal * 0.5, 2)))             # 50%: above the 5% cashier limit
        pg.get_by_text(re.compile("Cashiers can discount up to")).wait_for()          # limit message shown
        assert pg.get_by_role("button", name=re.compile("^Charge")).is_disabled(), "charge should be blocked above the cashier limit"
        pg.get_by_label("Discount ($)").fill("")
        pg.get_by_label("Cash received").fill("100")
        shot(pg, "pos")
        pg.get_by_role("button", name=re.compile("^Charge")).click()
        pg.get_by_text("Sale complete").wait_for()
        shot(pg, "pos-receipt")
        pg.get_by_role("button", name="New sale").click()
        # cashier products view hides cost
        pg.get_by_role("link", name="Products", exact=True).click()
        pg.wait_for_selector("table tbody tr")
        assert pg.get_by_role("columnheader", name="Cost").count() == 0, "cashier sees Cost column"
        # mobile layout
        mob = new_page(width=390, height=844)
        login(mob, "cashier")
        mob.get_by_role("heading", name="Point of Sale").wait_for()
        mob.get_by_role("button", name=re.compile(r"^Add .* to cart$")).first.click()
        shot(mob, "pos-mobile")

        # --- admin pages
        pg = new_page()
        login(pg, "admin")
        pg.get_by_role("link", name="Employees", exact=True).click()
        pg.get_by_role("heading", name="Employees").wait_for()
        pg.wait_for_selector("table tbody tr")
        shot(pg, "employees")
        pg.get_by_role("link", name="Audit Log", exact=True).click()
        pg.get_by_role("heading", name="Audit log").wait_for()
        pg.wait_for_selector("table tbody tr")
        shot(pg, "audit-log")
        pg.get_by_role("button", name="Sign out").click()
        pg.get_by_role("heading", name="Sign in").wait_for()
        browser.close()

    # The deliberate wrong-password login in this script makes the browser log one expected 401 resource error.
    problems = [p for p in problems if "favicon" not in p and "status of 401" not in p]
    if problems:
        print("\nRUNTIME PROBLEMS:")
        for p in dict.fromkeys(problems):
            print(" -", p)
        sys.exit(1)
    print("\nSMOKE TEST PASSED: all pages rendered, no console errors or uncaught exceptions")


if __name__ == "__main__":
    main()
