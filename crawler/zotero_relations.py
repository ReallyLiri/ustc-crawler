import json
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
        item_id_to_zot_key["data"] = item["key"]
        print(item)
    start += limit

for item_ids in item_id_to_zot_key.values():
    for item_id in item_ids:
        try:
            item = zot.item(f"#item_{item_id}")
            item['data']['relations'] = {
                'dc:relation': [f"#item_{id}" for id in item_ids if id != item_id],
            }
            zot.update_item(item)
        except Exception as e:
            print(f"Error updating item {item_id}: {e}")
