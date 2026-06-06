import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { extname, resolve, basename, relative, sep } from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fileURLToPath } from "url";
import formidable from "formidable";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const publicDir = resolve(__dirname, "../public");
const dbPath = resolve(__dirname, "../marketplace-data.json");
const port = parseInt(process.env.PORT ?? "3000", 10);

const s3Bucket = process.env.S3_BUCKET;
const s3Region = process.env.AWS_REGION;
const s3BaseUrl = process.env.S3_BASE_URL;
const s3Client = s3Bucket && s3Region ? new S3Client({ region: s3Region }) : undefined;

type User = {
  id: number;
  username: string;
  password: string;
  full_name: string;
  email: string;
  balance: number;
};

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  ownerId: number;
  ownerName: string;
  available: boolean;
  buyerName?: string;
  imageUrl?: string;
};

type Database = {
  nextUserId: number;
  nextProductId: number;
  users: User[];
  products: Product[];
};

// Load or initialize database
const loadDatabase = (): Database => {
  if (existsSync(dbPath)) {
    const data = readFileSync(dbPath, "utf-8");
    return JSON.parse(data);
  }
  return {
    nextUserId: 1,
    nextProductId: 1,
    users: [],
    products: [],
  };
};

// Save database to file
const saveDatabase = (db: Database): void => {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
};

let db = loadDatabase();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const sendFile = (res: ServerResponse, path: string, type: string): void => {
  try {
    const content = readFileSync(path);
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch (err) {
    console.error(`Failed to read file ${path}:`, err);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("File not found");
  }
};

const parseBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] ?? "";

  if (contentType.includes("application/json")) {
    return JSON.parse(body || "{}");
  }
  return Object.fromEntries(new URLSearchParams(body).entries());
};

const sendJson = (res: ServerResponse, data: unknown, status = 200): void => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const sendError = (res: ServerResponse, message: string, status = 400): void => {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
};

const findUser = (username: string): User | undefined => db.users.find((user) => user.username === username);
const findUserById = (id: number): User | undefined => db.users.find((user) => user.id === id);

const getProductWithDetails = (product: Product): Product => {
  const seller = findUserById(product.ownerId);
  let buyer: User | undefined;
  if (!product.available) {
    const foundBuyer = db.users.find((u) => product.id === db.products.find((p) => p.ownerId === u.id)?.id);
    buyer = foundBuyer;
  }
  return {
    ...product,
    ownerName: seller?.full_name ?? "לא ידוע",
    buyerName: buyer?.full_name,
  };
};

const getAllProducts = (): Product[] => {
  return db.products
    .sort((a, b) => b.id - a.id)
    .map((p) => {
      const seller = findUserById(p.ownerId);
      return {
        ...p,
        ownerName: seller?.full_name ?? "לא ידוע",
      };
    });
};

const handleApi = async (req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> => {
  if (req.method === "GET") {
    if (pathname === "/api/products") {
      sendJson(res, getAllProducts());
      return;
    }

    if (pathname === "/api/user") {
      const query = new URL(req.url ?? "", `http://${req.headers.host}`).searchParams;
      const username = query.get("username") ?? "";
      const user = findUser(username);
      if (!user) {
        sendError(res, "משתמש לא נמצא", 404);
        return;
      }
      const { password: _, ...userData } = user;
      sendJson(res, userData);
      return;
    }
  }

  if (req.method === "POST") {
    if (pathname === "/api/register") {
      const data = await parseBody(req);
      const username = String(data.username ?? "").trim();
      const password = String(data.password ?? "").trim();
      const fullName = String(data.fullName ?? "").trim();
      const email = String(data.email ?? "").trim();

      if (!username || !password || !fullName || !email) {
        sendError(res, "יש למלא את כל השדות", 400);
        return;
      }
      if (findUser(username)) {
        sendError(res, "שם משתמש קיים כבר", 400);
        return;
      }

      const user: User = {
        id: db.nextUserId++,
        username,
        password,
        full_name: fullName,
        email,
        balance: 100,
      };
      db.users.push(user);
      saveDatabase(db);

      const { password: _, ...payload } = user;
      sendJson(res, payload, 201);
      return;
    }

    if (pathname === "/api/login") {
      const data = await parseBody(req);
      const username = String(data.username ?? "").trim();
      const password = String(data.password ?? "").trim();
      const user = findUser(username);
      if (!user || user.password !== password) {
        sendError(res, "שם משתמש או סיסמה שגויים", 401);
        return;
      }
      const { password: _, ...payload } = user;
      sendJson(res, payload);
      return;
    }

    if (pathname === "/api/products") {
      const contentType = String(req.headers["content-type"] ?? "");
      let username = "";
      let name = "";
      let description = "";
      let price = 0;
      let imageUrl: string | undefined;

      if (contentType.includes("multipart/form-data")) {
        const uploadDir = resolve(publicDir, "uploads");
        if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
        const form = formidable({ multiples: false, uploadDir, keepExtensions: true });

        const parsed: any = await new Promise((resolveP, rejectP) => {
          form.parse(req, (err: any, fields: any, files: any) => {
            if (err) return rejectP(err);
            resolveP({ fields, files });
          });
        });

        const fields = parsed.fields ?? {};
        const files = parsed.files ?? {};
        username = String(fields.username ?? "").trim();
        name = String(fields.name ?? "").trim();
        description = String(fields.description ?? "").trim();
        price = Number(fields.price ?? 0);

        if (files.image) {
          const file = Array.isArray(files.image) ? files.image[0] : files.image;
          const savedPath = file.filepath || file.filePath || file.path;
          if (savedPath) {
            if (s3Client && s3Bucket) {
              try {
                const fileBuffer = readFileSync(savedPath);
                const key = `uploads/${Date.now()}-${basename(savedPath)}`;
                const contentType = file.mimetype || file.mimetypeType || file.type || "application/octet-stream";
                await s3Client.send(new PutObjectCommand({
                  Bucket: s3Bucket,
                  Key: key,
                  Body: fileBuffer,
                  ContentType: contentType,
                  ACL: "public-read",
                }));
                imageUrl = s3BaseUrl ? `${s3BaseUrl.replace(/\/$/, "")}/${key}` : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${key}`;
              } catch (err) {
                console.error("S3 upload failed:", err);
                // fallback to local URL
                imageUrl = `/uploads/${basename(savedPath)}`;
              } finally {
                try { unlinkSync(savedPath); } catch {}
              }
            } else {
              imageUrl = `/uploads/${basename(savedPath)}`;
            }
          }
        }
      } else {
        const data = await parseBody(req);
        username = String(data.username ?? "").trim();
        name = String(data.name ?? "").trim();
        description = String(data.description ?? "").trim();
        price = Number(data.price ?? 0);
      }

      const user = findUser(username);

      if (!user) {
        sendError(res, "עליך להתחבר כדי לפרסם מוצר", 401);
        return;
      }
      if (!name || !description || !price || price <= 0) {
        sendError(res, "יש למלא שם מוצר, תיאור ומחיר חוקי", 400);
        return;
      }

      const product: Product = {
        id: db.nextProductId++,
        name,
        description,
        price,
        ownerId: user.id,
        ownerName: user.full_name,
        available: true,
        imageUrl,
      };
      db.products.push(product);
      saveDatabase(db);

      sendJson(res, getProductWithDetails(product), 201);
      return;
    }

    if (pathname === "/api/buy") {
      const data = await parseBody(req);
      const username = String(data.username ?? "").trim();
      const productId = Number(data.productId ?? 0);
      const buyer = findUser(username);
      const product = db.products.find((p) => p.id === productId);

      if (!buyer) {
        sendError(res, "עליך להתחבר כדי לקנות מוצר", 401);
        return;
      }
      if (!product) {
        sendError(res, "המוצר לא נמצא", 404);
        return;
      }
      if (!product.available) {
        sendError(res, "המוצר כבר נמכר", 400);
        return;
      }
      if (product.ownerId === buyer.id) {
        sendError(res, "לא ניתן לקנות מוצר שלך עצמך", 400);
        return;
      }
      if (buyer.balance < product.price) {
        sendError(res, "אין לך מספיק מטבעות", 400);
        return;
      }

      const seller = findUserById(product.ownerId);
      if (!seller) {
        sendError(res, "מוכר לא נמצא", 404);
        return;
      }

      buyer.balance -= product.price;
      seller.balance += product.price;
      product.available = false;
      product.buyerName = buyer.full_name;

      saveDatabase(db);

      const { password: _, ...userData } = buyer;
      sendJson(res, { user: userData, product: getProductWithDetails(product) });
      return;
    }
  }

  sendError(res, "API לא נמצא", 404);
};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const rawUrl = req.url ?? "/";
  const url = new URL(rawUrl, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname);
    return;
  }

  if (req.method === "GET") {
    const filePath = pathname === "/" ? resolve(publicDir, "index.html") : resolve(publicDir, pathname.slice(1));
    const relPath = relative(publicDir, filePath);
    console.log(`GET ${pathname} -> path=${filePath}, rel=${relPath}`);
    if (relPath.startsWith("..")) {
      sendError(res, "גישה אסורה", 403);
      return;
    }
    const contentType = mimeTypes[extname(filePath)] ?? "application/octet-stream";
    sendFile(res, filePath, contentType);
    return;
  }

  sendError(res, "Page not found", 404);
});

server.listen(port, () => {
  console.log(`Marketplace App server running at http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
});

// Save database on exit
process.on("SIGINT", () => {
  saveDatabase(db);
  console.log("Database saved");
  process.exit(0);
});
