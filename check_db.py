import sqlite3
conn = sqlite3.connect('data/noorgrid.db')
cursor = conn.cursor()
cursor.execute('SELECT name FROM sqlite_master WHERE type=\"table\"')
print('Tables:', cursor.fetchall())
cursor.execute('SELECT COUNT(*) FROM weather_history')
print('Rows:', cursor.fetchone()[0])
cursor.execute('SELECT * FROM weather_history LIMIT 3')
for row in cursor.fetchall():
    print(row)
conn.close()