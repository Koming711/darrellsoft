import sqlite3

conn = sqlite3.connect('/home/z/my-project/db/custom.db')
cur = conn.cursor()

def esc(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"

def esc_id(s):
    if s is None:
        return 'NULL'
    return "'" + str(s) + "'"

# Settings
print('-- Settings')
cur.execute('SELECT id, key, value, createdAt, updatedAt FROM Setting')
for row in cur.fetchall():
    print(f"INSERT INTO \"Setting\" (\"id\", \"key\", \"value\", \"createdAt\", \"updatedAt\") VALUES ({esc_id(row[0])}, {esc(row[1])}, {esc(row[2])}, {esc(row[3])}, {esc(row[4])}) ON CONFLICT (\"key\") DO UPDATE SET \"value\" = EXCLUDED.\"value\";")

# Pengguna
print()
print('-- Pengguna')
cur.execute('SELECT id, namaLengkap, nomorHP, email, username, password, role, createdAt, validUntil FROM Pengguna')
for row in cur.fetchall():
    print(f"INSERT INTO \"Pengguna\" (\"id\", \"namaLengkap\", \"nomorHP\", \"email\", \"username\", \"password\", \"role\", \"createdAt\", \"validUntil\") VALUES ({esc_id(row[0])}, {esc(row[1])}, {esc(row[2])}, {esc(row[3])}, {esc(row[4])}, {esc(row[5])}, {esc(row[6])}, {esc(row[7])}, {esc(row[8])}) ON CONFLICT (\"username\") DO UPDATE SET \"password\" = EXCLUDED.\"password\", \"role\" = EXCLUDED.\"role\";")

# Customer
print()
print('-- Customer')
cur.execute('SELECT id, name, companyName, address, phone, email, userId, createdAt, updatedAt FROM Customer')
for row in cur.fetchall():
    print(f"INSERT INTO \"Customer\" (\"id\", \"name\", \"companyName\", \"address\", \"phone\", \"email\", \"userId\", \"createdAt\", \"updatedAt\") VALUES ({esc_id(row[0])}, {esc(row[1])}, {esc(row[2])}, {esc(row[3])}, {esc(row[4])}, {esc(row[5])}, {esc_id(row[6])}, {esc(row[7])}, {esc(row[8])}) ON CONFLICT DO NOTHING;")

# Paper
print()
print('-- Paper')
cur.execute('SELECT id, name, grammage, width, height, pricePerRim, userId, createdAt, updatedAt FROM Paper')
for row in cur.fetchall():
    print(f"INSERT INTO \"Paper\" (\"id\", \"name\", \"grammage\", \"width\", \"height\", \"pricePerRim\", \"userId\", \"createdAt\", \"updatedAt\") VALUES ({esc_id(row[0])}, {esc(row[1])}, {row[2]}, {row[3]}, {row[4]}, {row[5]}, {esc_id(row[6])}, {esc(row[7])}, {esc(row[8])}) ON CONFLICT DO NOTHING;")

# PrintingCost
print()
print('-- PrintingCost')
cur.execute('SELECT id, machineName, grammage, printAreaWidth, printAreaHeight, pricePerColor, specialColorPrice, minimumPrintQuantity, priceAboveMinimumPerSheet, platePricePerSheet, userId, createdAt, updatedAt FROM PrintingCost')
for row in cur.fetchall():
    print(f"INSERT INTO \"PrintingCost\" (\"id\", \"machineName\", \"grammage\", \"printAreaWidth\", \"printAreaHeight\", \"pricePerColor\", \"specialColorPrice\", \"minimumPrintQuantity\", \"priceAboveMinimumPerSheet\", \"platePricePerSheet\", \"userId\", \"createdAt\", \"updatedAt\") VALUES ({esc_id(row[0])}, {esc(row[1])}, {row[2]}, {row[3]}, {row[4]}, {row[5]}, {row[6]}, {row[7]}, {row[8]}, {row[9]}, {esc_id(row[10])}, {esc(row[11])}, {esc(row[12])}) ON CONFLICT DO NOTHING;")

# Finishing
print()
print('-- Finishing')
cur.execute('SELECT id, name, minimumSheets, minimumPrice, additionalPrice, pricePerCm, userId, createdAt, updatedAt FROM Finishing')
for row in cur.fetchall():
    print(f"INSERT INTO \"Finishing\" (\"id\", \"name\", \"minimumSheets\", \"minimumPrice\", \"additionalPrice\", \"pricePerCm\", \"userId\", \"createdAt\", \"updatedAt\") VALUES ({esc_id(row[0])}, {esc(row[1])}, {row[2]}, {row[3]}, {row[4]}, {row[5]}, {esc_id(row[6])}, {esc(row[7])}, {esc(row[8])}) ON CONFLICT DO NOTHING;")

conn.close()
