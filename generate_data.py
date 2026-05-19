#!/usr/bin/env python3
"""
Synthetic data generator for the Expense Tracker (SQLite version).
Creates demo users, ~3000 transactions, and optional budgets.
"""

import sqlite3
import uuid
import random
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

DB_FILE = 'data.db'

# ---------- Configuration ----------
USERS = [
    {'email': 'alice@example.com', 'password': 'alice123'},
    {'email': 'bob@example.com',   'password': 'bob123'},
    {'email': 'carol@example.com', 'password': 'carol123'},
]

CATEGORIES_EXPENSE = ['Food', 'Transport', 'Utilities', 'Entertainment', 'Others']
CATEGORIES_INCOME  = ['Salary']
TOTAL_TRANSACTIONS = 3000   # divided evenly among users

end_date   = datetime.now()
start_date = end_date - timedelta(days=365)

# Optional: set budgets for each user (same for all)
BUDGETS = {
    'Food': 500,
    'Transport': 500,
    'Utilities': 2000,
    'Entertainment': 1000,
    'Others': 2500
}

# ---------- Helpers ----------
def random_date() -> str:
    """Return a random date within the last year as YYYY-MM-DD."""
    days = (end_date - start_date).days
    d = start_date + timedelta(days=random.randint(0, days))
    return d.strftime('%Y-%m-%d')

def generate_transactions(user_id: str, count: int):
    """Create a list of transaction dicts for one user."""
    txns = []
    for _ in range(count):
        if random.random() < 0.1:   # 30% income
            txn_type = 'income'
            category = random.choice(CATEGORIES_INCOME)
            amount = round(random.uniform(2000, 5000), 2)
        else:
            txn_type = 'expense'
            category = random.choice(CATEGORIES_EXPENSE)
            if category == 'Food':
                amount = round(random.uniform(5, 80), 2)
            elif category == 'Transport':
                amount = round(random.uniform(2, 60), 2)
            elif category == 'Utilities':
                amount = round(random.uniform(30, 200), 2)
            elif category == 'Entertainment':
                amount = round(random.uniform(10, 150), 2)
            else:  # Others
                amount = round(random.uniform(5, 300), 2)
        date = random_date()
        note = random.choice(['', 'Monthly', 'Online payment', 'Cash', 'Subscription'])
        txns.append({
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'type': txn_type,
            'amount': amount,
            'category': category,
            'date': date,
            'note': note
        })
    return txns

# ---------- Main ----------
def main():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    # Ensure tables exist (same schema as app.py)
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
    """)

    # Clear existing data (optional – comment out if you want to keep old data)
    cur.execute("DELETE FROM budgets")
    cur.execute("DELETE FROM transactions")
    cur.execute("DELETE FROM users")

    # Insert users
    user_ids = {}
    for u in USERS:
        uid = str(uuid.uuid4())
        user_ids[u['email']] = uid
        pwd_hash = generate_password_hash(u['password'])
        cur.execute("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
                     (uid, u['email'], pwd_hash))

    # Insert transactions
    per_user = TOTAL_TRANSACTIONS // len(user_ids)
    txns = []
    for uid in user_ids.values():
        txns.extend(generate_transactions(uid, per_user))
    # Bulk insert
    cur.executemany(
        "INSERT INTO transactions (id, user_id, type, amount, category, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(t['id'], t['user_id'], t['type'], t['amount'], t['category'], t['date'], t['note']) for t in txns]
    )

    # Insert budgets for each user
    for uid in user_ids.values():
        for cat, amt in BUDGETS.items():
            cur.execute("INSERT OR REPLACE INTO budgets (user_id, category, amount) VALUES (?, ?, ?)",
                        (uid, cat, amt))

    conn.commit()
    conn.close()

    print(f"✅ Database populated: {len(USERS)} users, {len(txns)} transactions, budgets set.")
    print("   Demo logins:")
    for u in USERS:
        print(f"   {u['email']}  /  {u['password']}")

if __name__ == '__main__':
    random.seed(42)  # reproducible randomness
    main()