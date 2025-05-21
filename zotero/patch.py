import concurrent.futures
import json
import os

from pyzotero import zotero
from tqdm import tqdm

zotero.timeout = 180

API_KEY = os.environ['ZOTERO_API_KEY']
LIBRARY_ID = os.environ['ZOTERO_LIBRARY_ID']
LIBRARY_TYPE = os.environ['ZOTERO_LIBRARY_TYPE']
COLLECTION_KEY = "3WTMLSGR"
zot = zotero.Zotero(LIBRARY_ID, LIBRARY_TYPE, API_KEY)


def process_item(item):
    extra = item.get("data", {}).get("extra", "")
    if not extra:
        return None, None

    ustc_id = extra.split("USTC ID: ")[-1].split("\n")[0] if "USTC ID: " in extra else None
    if not ustc_id:
        return None, None

    is_lost = "Digitised: False" in extra and "Has copies: False" in extra
    if not is_lost:
        print(f"USTC ID: {ustc_id} (key={item['key']}) is lost")
        item["data"]["extra"] = extra.replace("Lost: true", "Lost: false")
        zot.update_item(item)

    return ustc_id, item["key"]


if os.path.exists("out/keys.json"):
    with open("out/keys.json", "r") as f:
        item_id_to_zot_key = json.load(f)

if len(item_id_to_zot_key) == 0:
    start = 0
    limit = 100
    failed_items = []

    while True:
        print(f"Fetching items from {start} to {start + limit}")
        batch = zot.collection_items(COLLECTION_KEY, itemType="book", start=start, limit=limit)
        if not batch:
            break

        for item in batch:
            try:
                ustc_id, key = process_item(item)
                if ustc_id and key:
                    item_id_to_zot_key[ustc_id] = item_id_to_zot_key.get(ustc_id, [])
                    item_id_to_zot_key[ustc_id].append(key)
            except Exception as e:
                failed_items.append(item["key"])
                print(f"Failed to process item {item['key']}: {e}")

        start += limit

    if failed_items:
        with open("out/failed_items.txt", "w") as f:
            for key in failed_items:
                f.write(f"{key}\n")

print(f"Found {len(item_id_to_zot_key)} clusters")

exit(0)

all_keys_tuples = []
for i, keys in enumerate(item_id_to_zot_key.values()):
    try:
        print(f"Updating cluster {i + 1}/{len(item_id_to_zot_key)}", keys)
        for key in keys:
            item = zot.item(key)
            if len(item["data"].get("relations", [])) >= len(keys) - 1:
                continue
            item['data']['relations'] = {
                'dc:relation': [f"http://zotero.org/groups/{LIBRARY_ID}/items/{k}" for k in keys if k != key],
            }
            zot.update_item(item)
    except Exception as e:
        print(f"Error updating cluster {keys}: {e}")
