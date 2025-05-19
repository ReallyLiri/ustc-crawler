import os

from pyzotero import zotero

API_KEY = os.environ['ZOTERO_API_KEY']
LIBRARY_ID = os.environ['ZOTERO_LIBRARY_ID']
LIBRARY_TYPE = os.environ['ZOTERO_LIBRARY_TYPE']
COLLECTION_KEY = "3WTMLSGR"
zot = zotero.Zotero(LIBRARY_ID, LIBRARY_TYPE, API_KEY)

item_id_to_zot_key = {}
start = 0
limit = 100
while True:
    batch = zot.collection_items(COLLECTION_KEY, itemType="book", start=start, limit=limit)
    if not batch:
        break
    for item in batch:
        extra = item.get("data", {}).get("extra", "")
        if not extra:
            continue
        ustc_id = extra.split("USTC ID: ")[-1].split("\n")[0] if "USTC ID: " in extra else None
        if not ustc_id:
            continue
        item_id_to_zot_key[ustc_id] = item_id_to_zot_key.get(ustc_id, [])
        item_id_to_zot_key[ustc_id].append(item["key"])

        is_lost = "Digitised: False" in extra and "Has copies: False" in extra
        if is_lost:
            print(f"USTC ID: {ustc_id} (key={item["key"]}) is lost")
            item["data"]["extra"] = extra.replace("Lost: true", "Lost: false")
            zot.update_item(item)
    start += limit

print(f"Found {len(item_id_to_zot_key)} clusters")

for keys in item_id_to_zot_key.values():
    for key in keys:
        try:
            item = zot.item(key)
            item['data']['relations'] = {
                'dc:relation': [f"#item_{k}" for k in keys if k != key],
            }
            zot.update_item(item)
        except Exception as e:
            print(f"Error updating item {key}: {e}")
