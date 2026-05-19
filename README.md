# 💰 Expense Tracker — Modern Personal Finance SPA

A full‑stack, single‑page personal finance application built with a clean, professional aesthetic.  
Track income, expenses, and budgets, visualize spending trends, and keep your financial data secure.

> **No heavy frontend frameworks, no external chart libraries — just Python, vanilla HTML/CSS/JS, and a touch of SVG.**

![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.8+-blue)
![Flask](https://img.shields.io/badge/flask-2.x-lightgrey)
![Vanilla JS](https://img.shields.io/badge/frontend-vanilla%20JS-yellow)
---

## ✨ Features

### 🔐 Secure Authentication
- Register and login with email and password.
- Passwords hashed and salted with **Werkzeug** (industry‑standard).
- **JWT**‑based authentication with 24‑hour token expiration.
- Automatic logout when the token expires.

### 📊 Dashboard
- **Summary cards** for balance, income, and expenses (with smooth bounce animation on balance updates).
- **Bar chart** and **doughnut chart** (SVG, zero dependencies) showing spending by category.
- Toggle between chart types.
- **Custom date range** picker — view stats for any period, not just the current month.
- Recent activity list (last 5 transactions).

### 💸 Transactions
- Add transactions with type, amount, category, date, and optional note.
- View all transactions with filtering by type, category, and date range.
- **Optimistic UI deletion** — transactions are removed immediately; the UI rolls back gracefully on error.
- Strict client‑side validation before sending requests.

### 💰 Budgets
- Set monthly budgets per category (Food, Transport, Utilities, Entertainment, Others).
- Visual progress bars show spending vs budget for the current month.

### 📈 Analytics
- Dual‑bar chart (income vs expenses) for the last 12 months, built entirely with CSS/SVG.

### ⚙️ Settings
- Change your password directly from the app.

### 🎨 Polished UI
- **Nordic minimal** design with soft matte surfaces, high‑quality typography (Inter), and subtle shadows.
- **Fully responsive** — works beautifully on desktop, tablet, and mobile.
- **Glass‑free** — professional fintech aesthetic, not flashy.
- Custom SVG favicon and in‑app brand icon.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3, Flask, SQLite3, JWT (PyJWT), Werkzeug (password hashing) |
| **Frontend** | Vanilla HTML5, CSS3 (custom properties, Flexbox/Grid), JavaScript (ES6+) |
| **Charts** | Custom SVG & CSS — no third‑party chart libraries |
| **Storage** | SQLite (production‑ready for single‑user or small team use) |
| **Authentication** | JWT (JSON Web Tokens), Werkzeug `generate_password_hash` / `check_password_hash` |

**No React, Bootstrap, jQuery, or chart.js.**  
Everything is built from scratch for maximum performance and maintainability.

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.8+** (with `pip`)
- A modern web browser

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/MysticFusion/Expanse-Tracker
cd Expanse-Tracker
```

**2. Install Python dependencies**
```bash
pip install flask pyjwt werkzeug
```

**3. Run the server**
```bash
python app.py
```

**4. Open the app**  
Visit `http://localhost:5000` in your browser.

### (Optional) Generate Synthetic Test Data

If you want to see the app populated with realistic data, use the `generate_data_db.py` script:

```bash
python generate_data_db.py
```

This will create three demo users (`alice`, `bob`, `carol`) with 1000 transactions each and predefined budgets.

| User | Password |
|---|---|
| alice@example.com | alice123 |
| bob@example.com | bob123 |
| carol@example.com | carol123 |

---

## 📁 Project Structure

```
.
├── app.py                  # Flask backend (API, auth, SQLite)
├── index.html              # Single‑page application shell
├── style.css               # Global styles, design system, responsive layout
├── script.js               # Frontend logic, API calls, UI state management
├── data.db                 # SQLite database (auto‑created on first run)
├── generate_data_db.py     # Script to populate DB with synthetic data
└── README.md               # You are here
```

---

## 🔌 API Endpoints

All endpoints are prefixed with `/api/` and require a valid JWT (except login/register).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/register` | Register a new user |
| `POST` | `/api/login` | Login, returns JWT token |
| `GET` | `/api/user` | Get current user email |
| `POST` | `/api/change-password` | Change current password |
| `GET` | `/api/transactions` | Get all transactions for the logged‑in user |
| `POST` | `/api/transactions` | Create a new transaction |
| `DELETE` | `/api/transactions/<id>` | Delete a transaction (owner only) |
| `GET` | `/api/summary?start=&end=` | Get income/expense breakdown (default: this month) |
| `GET` | `/api/budgets` | Get user budgets |
| `POST` | `/api/budgets` | Set or update budgets |
| `GET` | `/api/analytics/monthly` | Monthly income vs expenses (last 12 months) |

---

## 🔒 Security Highlights

- Passwords are hashed using Werkzeug's `generate_password_hash` (salted, PBKDF2‑based) — never stored in plain text.
- JWT tokens expire after 24 hours; a `401` response automatically logs out the user on the frontend.
- SQL injection prevented by parameterized queries throughout.
- CORS is restricted to `localhost:5000` by default (configurable).
- Input validation both on the client (pre‑submit) and server (API level).

---

## 📜 License

This project is open‑source and available under the **MIT License**.  
Feel free to fork, modify, and use it as you see fit.
