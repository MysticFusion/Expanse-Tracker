#!/usr/bin/env python3
"""
Expense Tracker Backend – SQLite, JWT, Secure Hashing, CORS, Date Range Summary
"""

import sqlite3
import os
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Flask, request, jsonify, send_from_directory, g
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')

# ---------- Configuration ----------
DATABASE = 'data.db'
SECRET_KEY = os.environ.get('SECRET_KEY', 'change-me-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24
ALLOWED_ORIGINS = ['http://localhost:5000', 'http://127.0.0.1:5000']

# ---------- Database Helpers ----------
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db

def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

app.teardown_appcontext(close_db)

def init_db():
    db = sqlite3.connect(DATABASE)
    cur = db.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income','expense')),
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            note TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS budgets (
            user_id TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            PRIMARY KEY (user_id, category),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);
    """)
    db.commit()
    db.close()

# ---------- JWT Utilities ----------
def create_jwt(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_jwt(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])

# ---------- Auth Decorator ----------
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid Authorization header'}), 401
        token = auth_header.split(' ', 1)[1]
        try:
            payload = decode_jwt(token)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        db = get_db()
        user = db.execute("SELECT * FROM users WHERE id = ?", (payload['sub'],)).fetchone()
        if not user:
            return jsonify({'error': 'User not found'}), 401
        g.current_user = user
        return f(*args, **kwargs)
    return decorated

# ---------- CORS ----------
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Vary'] = 'Origin'
    return response

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return '', 200

# ---------- Static Files ----------
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/style.css')
def serve_css():
    return send_from_directory('.', 'style.css')

@app.route('/script.js')
def serve_js():
    return send_from_directory('.', 'script.js')

# ---------- Auth Endpoints ----------
@app.route('/api/register', methods=['POST'])
def register():
    body = request.get_json() or {}
    email = body.get('email', '').strip().lower()
    password = body.get('password', '')

    if not email or len(password) < 6:
        return jsonify({'error': 'Email and password (min 6 chars) required.'}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        return jsonify({'error': 'Email already registered.'}), 409

    user_id = str(uuid.uuid4())
    password_hash = generate_password_hash(password)
    db.execute(
        "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
        (user_id, email, password_hash)
    )
    db.commit()

    token = create_jwt(user_id)
    return jsonify({'token': token}), 201

@app.route('/api/login', methods=['POST'])
def login():
    body = request.get_json() or {}
    email = body.get('email', '').strip().lower()
    password = body.get('password', '')

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid credentials.'}), 401

    token = create_jwt(user['id'])
    return jsonify({'token': token}), 200

@app.route('/api/user', methods=['GET'])
@require_auth
def get_user():
    user = g.current_user
    return jsonify({'email': user['email']})

@app.route('/api/change-password', methods=['POST'])
@require_auth
def change_password():
    user = g.current_user
    body = request.get_json() or {}
    old = body.get('old_password', '')
    new = body.get('new_password', '')

    if not old or len(new) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400
    if not check_password_hash(user['password_hash'], old):
        return jsonify({'error': 'Current password incorrect.'}), 403

    db = get_db()
    new_hash = generate_password_hash(new)
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user['id']))
    db.commit()
    return jsonify({'message': 'Password changed. Please login again.'})

# ---------- Transactions Endpoints ----------
@app.route('/api/transactions', methods=['GET'])
@require_auth
def get_transactions():
    user = g.current_user
    db = get_db()
    rows = db.execute(
        "SELECT id, type, amount, category, date, note FROM transactions WHERE user_id = ?",
        (user['id'],)
    ).fetchall()
    return jsonify([dict(row) for row in rows])

@app.route('/api/transactions', methods=['POST'])
@require_auth
def add_transaction():
    user = g.current_user
    body = request.get_json() or {}

    required = ['type', 'amount', 'category', 'date']
    for field in required:
        if field not in body:
            return jsonify({'error': f'Missing {field}'}), 400
    if body['type'] not in ('income', 'expense'):
        return jsonify({'error': 'Type must be income or expense'}), 400
    try:
        amount = float(body['amount'])
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({'error': 'Amount must be a positive number'}), 400
    try:
        datetime.strptime(body['date'], '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': 'Date must be YYYY-MM-DD'}), 400

    txn_id = str(uuid.uuid4())
    db = get_db()
    db.execute(
        "INSERT INTO transactions (id, user_id, type, amount, category, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (txn_id, user['id'], body['type'], amount, body['category'], body['date'], body.get('note', ''))
    )
    db.commit()

    return jsonify({
        'id': txn_id,
        'type': body['type'],
        'amount': amount,
        'category': body['category'],
        'date': body['date'],
        'note': body.get('note', '')
    }), 201

@app.route('/api/transactions/<txn_id>', methods=['DELETE'])
@require_auth
def delete_transaction(txn_id):
    user = g.current_user
    db = get_db()
    row = db.execute(
        "SELECT id FROM transactions WHERE id = ? AND user_id = ?",
        (txn_id, user['id'])
    ).fetchone()
    if not row:
        return jsonify({'error': 'Transaction not found or access denied'}), 404

    db.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
    db.commit()
    return jsonify({'message': 'Deleted'})

# ---------- Summary Endpoint (now supports date range) ----------
@app.route('/api/summary', methods=['GET'])
@require_auth
def get_summary():
    user = g.current_user
    db = get_db()

    # Optional start/end parameters for custom date range
    start_date = request.args.get('start')
    end_date = request.args.get('end')

    # Default to current month if either is missing or invalid
    if not start_date or not end_date:
        now = datetime.now()
        start_date = now.strftime('%Y-%m-01')  # first day of current month
        end_date = now.strftime('%Y-%m-%d')    # today (to include partial month)
    else:
        # Validate format
        try:
            datetime.strptime(start_date, '%Y-%m-%d')
            datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

    rows = db.execute(
        "SELECT type, amount, category FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?",
        (user['id'], start_date, end_date)
    ).fetchall()

    total_income = 0.0
    total_expense = 0.0
    expenses_by_cat = {}

    for row in rows:
        amt = row['amount']
        if row['type'] == 'income':
            total_income += amt
        elif row['type'] == 'expense':
            total_expense += amt
            cat = row['category']
            expenses_by_cat[cat] = expenses_by_cat.get(cat, 0) + amt

    return jsonify({
        'total_income': round(total_income, 2),
        'total_expense': round(total_expense, 2),
        'balance': round(total_income - total_expense, 2),
        'expenses_by_category': {k: round(v, 2) for k, v in expenses_by_cat.items()},
        'start': start_date,
        'end': end_date
    })

# ---------- Budgets Endpoints ----------
@app.route('/api/budgets', methods=['GET'])
@require_auth
def get_budgets():
    user = g.current_user
    db = get_db()
    rows = db.execute(
        "SELECT category, amount FROM budgets WHERE user_id = ?",
        (user['id'],)
    ).fetchall()
    return jsonify({row['category']: row['amount'] for row in rows})

@app.route('/api/budgets', methods=['POST'])
@require_auth
def set_budgets():
    user = g.current_user
    body = request.get_json() or {}
    if not body:
        return jsonify({'error': 'No budget data provided'}), 400

    for cat, val in body.items():
        try:
            amt = float(val)
            if amt < 0:
                raise ValueError
        except (ValueError, TypeError):
            return jsonify({'error': f'Invalid amount for {cat}'}), 400

    db = get_db()
    with db:
        for cat, amt in body.items():
            db.execute(
                "INSERT OR REPLACE INTO budgets (user_id, category, amount) VALUES (?, ?, ?)",
                (user['id'], cat, amt)
            )
    return jsonify({'message': 'Budgets updated'})

# ---------- Analytics Endpoint ----------
@app.route('/api/analytics/monthly', methods=['GET'])
@require_auth
def monthly_analytics():
    user = g.current_user
    db = get_db()
    now = datetime.now()
    last_year = now - timedelta(days=365)

    rows = db.execute(
        "SELECT date, type, amount FROM transactions WHERE user_id = ? AND date >= ?",
        (user['id'], last_year.strftime('%Y-%m-%d'))
    ).fetchall()

    monthly = {}
    for row in rows:
        month = row['date'][:7]
        monthly.setdefault(month, {'income': 0, 'expense': 0})
        if row['type'] == 'income':
            monthly[month]['income'] += row['amount']
        else:
            monthly[month]['expense'] += row['amount']

    sorted_months = sorted(monthly.keys())
    return jsonify([
        {
            'month': m,
            'income': round(monthly[m]['income'], 2),
            'expense': round(monthly[m]['expense'], 2)
        }
        for m in sorted_months
    ])

# ---------- Main ----------
if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)