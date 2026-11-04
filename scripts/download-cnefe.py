"""Download a pinned public IBGE archive using Python's standard library in Docker."""
import argparse
import hashlib
import json
import pathlib
import shutil
import urllib.request
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--manifest", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
manifest = json.loads(pathlib.Path(args.manifest).read_text(encoding="utf-8"))
output = pathlib.Path(args.output)
output.mkdir(parents=True, exist_ok=True)

def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()

csv_path = output / f"{manifest['municipalityCode']}.csv"
if csv_path.exists() and sha256(csv_path) == manifest["csvSha256"]:
    print(json.dumps({"csv": str(csv_path), "verified": True, "reused": True}))
else:
    source_url = manifest["source"]
    if not source_url.startswith("https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/"):
        raise ValueError("Unsupported source")
    archive_path = output / f"{manifest['municipalityCode']}.zip"
    if not archive_path.exists():
        partial = archive_path.with_suffix(".zip.part")
        with urllib.request.urlopen(source_url, timeout=60) as source, partial.open("wb") as target:
            shutil.copyfileobj(source, target)
        partial.replace(archive_path)
    if sha256(archive_path) != manifest["sha256"]:
        raise ValueError("Archive checksum mismatch")
    with zipfile.ZipFile(archive_path) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if len(members) != 1:
            raise ValueError("Expected exactly one CSV")
        partial = csv_path.with_suffix(".csv.part")
        with archive.open(members[0]) as source, partial.open("wb") as target:
            shutil.copyfileobj(source, target)
    if sha256(partial) != manifest["csvSha256"]:
        raise ValueError("CSV checksum mismatch")
    partial.replace(csv_path)
    print(json.dumps({"csv": str(csv_path), "verified": True, "reused": False}))
