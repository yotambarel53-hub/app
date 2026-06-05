const api = {
  products: "/api/products",
  register: "/api/register",
  login: "/api/login",
  user: "/api/user",
  createProduct: "/api/products",
  buy: "/api/buy",
};

const elements = {
  welcome: document.getElementById("welcome"),
  balance: document.getElementById("balance"),
  authSection: document.getElementById("auth-section"),
  sellerSection: document.getElementById("seller-section"),
  loginForm: document.getElementById("login-form"),
  registerForm: document.getElementById("register-form"),
  productForm: document.getElementById("product-form"),
  productList: document.getElementById("product-list"),
  messageBox: document.getElementById("message-box"),
  logoutButton: document.getElementById("logout-button"),
  currentUserName: document.getElementById("current-user-name"),
  currentUserEmail: document.getElementById("current-user-email"),
};

const state = {
  user: null,
  products: [],
};

const setMessage = (text, type = "info") => {
  elements.messageBox.innerHTML = `<div class="message ${type}">${text}</div>`;
};

const saveCurrentUser = (username) => {
  localStorage.setItem("marketplaceUser", username);
};

const clearCurrentUser = () => {
  localStorage.removeItem("marketplaceUser");
  state.user = null;
};

const getStoredUser = () => localStorage.getItem("marketplaceUser");

const updateUserUI = () => {
  if (!state.user) {
    elements.welcome.innerText = "ברוך הבא לחנות המקומית! התחבר או הרשם כדי להתחיל לקנות ולמכור.";
    elements.balance.innerText = "";
    elements.authSection.classList.remove("hidden");
    elements.sellerSection.classList.add("hidden");
    elements.logoutButton.classList.add("hidden");
    elements.currentUserName.innerText = "";
    elements.currentUserEmail.innerText = "";
  } else {
    elements.welcome.innerText = `שלום ${state.user.fullName}! אתה מחובר בהצלחה.`;
    elements.balance.innerText = `חשבון: ${state.user.balance} מטבעות`;
    elements.authSection.classList.add("hidden");
    elements.sellerSection.classList.remove("hidden");
    elements.logoutButton.classList.remove("hidden");
    elements.currentUserName.innerText = state.user.fullName;
    elements.currentUserEmail.innerText = state.user.email;
  }
};

const renderProducts = () => {
  if (!state.products.length) {
    elements.productList.innerHTML = "<p>אין מוצרים זמינים כרגע. הוסף מוצר ראשון!</p>";
    return;
  }

  elements.productList.innerHTML = state.products
    .map((product) => {
      const ownerLabel = product.ownerName ? `${product.ownerName}` : "לא ידוע";
      const available = product.available;
      const ownProduct = state.user && product.ownerName === state.user.fullName;
      const canBuy = state.user && available && !ownProduct;
      const isSold = !available;
      const soldLabel = isSold ? `<p class="product-status sold">נמכר ל-${product.buyerName}</p>` : "";
      const actionButton = canBuy
        ? `<button data-product-id="${product.id}" class="buy-button">קנה ב-${product.price} מטבעות</button>`
        : ownProduct
        ? `<button class="disabled">זה המוצר שלך</button>`
        : available
        ? `<button class="disabled">התחבר כדי לקנות</button>`
        : `<button class="disabled">מוצר נמכר</button>`;

      return `
        <article class="product-card">
          <h3>${product.name}</h3>
          <p class="product-owner">מוכר: ${ownerLabel}</p>
          <p>${product.description}</p>
          <p class="product-price">מחיר: ${product.price} מטבעות</p>
          ${soldLabel}
          <div class="product-actions">${actionButton}</div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".buy-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLButtonElement)) return;
      const id = target.dataset.productId;
      if (!id) return;
      await buyProduct(Number(id));
    });
  });
};

const loadProducts = async () => {
  try {
    const response = await fetch(api.products);
    state.products = await response.json();
    renderProducts();
  } catch (error) {
    setMessage("שגיאה בטעינת מוצרים", "error");
  }
};

const loadCurrentUser = async (username) => {
  try {
    const response = await fetch(`${api.user}?username=${encodeURIComponent(username)}`);
    if (!response.ok) {
      clearCurrentUser();
      updateUserUI();
      return;
    }
    state.user = await response.json();
    updateUserUI();
  } catch {
    clearCurrentUser();
    updateUserUI();
  }
};

const registerUser = async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = {
    username: form.username.value,
    password: form.password.value,
    fullName: form.fullName.value,
    email: form.email.value,
  };

  const response = await fetch(api.register, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    setMessage(`הרשמה נכשלה: ${error}`, "error");
    return;
  }

  const user = await response.json();
  state.user = user;
  saveCurrentUser(user.username);
  updateUserUI();
  loadProducts();
  setMessage("ההרשמה הצליחה! קיבלת 100 מטבעות וירטואליות.", "success");
  form.reset();
};

const loginUser = async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = {
    username: form.username.value,
    password: form.password.value,
  };

  const response = await fetch(api.login, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    setMessage(`התחברות נכשלה: ${error}`, "error");
    return;
  }

  const user = await response.json();
  state.user = user;
  saveCurrentUser(user.username);
  updateUserUI();
  setMessage("נכנסת בהצלחה!", "success");
  form.reset();
};

const createProduct = async (event) => {
  event.preventDefault();
  if (!state.user) {
    setMessage("עליך להתחבר כדי לפרסם מוצר.", "error");
    return;
  }

  const form = event.target;
  const data = {
    username: state.user.username,
    name: form.productName.value,
    description: form.description.value,
    price: Number(form.price.value),
  };

  const response = await fetch(api.createProduct, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.text();
    setMessage(`יצירת מוצר נכשלה: ${error}`, "error");
    return;
  }

  await loadProducts();
  await loadCurrentUser(state.user.username);
  setMessage("המוצר נוסף בהצלחה!", "success");
  form.reset();
};

const buyProduct = async (productId) => {
  if (!state.user) {
    setMessage("עליך להתחבר כדי לקנות מוצר.", "error");
    return;
  }

  const response = await fetch(api.buy, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: state.user.username, productId }),
  });

  if (!response.ok) {
    const error = await response.text();
    setMessage(`קניה נכשלה: ${error}`, "error");
    return;
  }

  const result = await response.json();
  state.user = result.user;
  saveCurrentUser(result.user.username);
  updateUserUI();
  await loadProducts();
  setMessage("הרכישה בוצעה בהצלחה!", "success");
};

const logout = () => {
  clearCurrentUser();
  updateUserUI();
  setMessage("התנתקת בהצלחה.", "info");
};

const bindEvents = () => {
  elements.loginForm.addEventListener("submit", loginUser);
  elements.registerForm.addEventListener("submit", registerUser);
  elements.productForm.addEventListener("submit", createProduct);
  elements.logoutButton.addEventListener("click", logout);
};

const init = async () => {
  bindEvents();
  const storedUsername = getStoredUser();
  if (storedUsername) {
    await loadCurrentUser(storedUsername);
  } else {
    updateUserUI();
  }
  await loadProducts();
};

init();
