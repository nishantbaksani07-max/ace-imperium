#!/usr/bin/env python3
"""
Comprehensive fix for ALL remaining Vitality/Vee/V brand references in UI text.
This script fixes ONLY user-facing text, preserving all code identifiers.
"""
import os
import re
from pathlib import Path

BASE_DIR = Path('.')
SKIP_DIRS = {'node_modules', '.git', '__tests__', 'tests', '.next', 'out', 'dist', 'mcp', '.claude'}

def should_process(filepath):
    """Check if file should be processed."""
    parts = Path(filepath).parts
    if any(skip in parts for skip in SKIP_DIRS):
        return False
    ext = filepath.suffix
    if ext in {'.test.ts', '.test.tsx', '.test.js', '.spec.ts', '.spec.tsx', '.spec.js'}:
        return False
    return ext in {'.tsx', '.ts', '.css', '.jsx', '.js', '.mdx', '.md'}

def fix_file(filepath):
    """Fix user-facing brand text in a single file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return False

    original = content

    # Fix UI text instances (NOT code identifiers)
    # Fix "VEE" in UI tags/labels
    content = re.sub(r'(<span[^>]*hVeeTag[^>]*>)VEE(</span>)', r'\1IMPERIUM\2', content)

    # Fix "paused by the Vitality team" comment
    content = re.sub(r'paused by the Vitality team', 'paused by the Imperium team', content)

    # Fix "flat-faceted V gem" in comments
    content = re.sub(r'flat-faceted "V" gem', 'flat-faceted "I" gem', content)

    # Fix "Vee" in UI text contexts (a href text, labels)
    # Example: <a href="/app/mentor">Vee</a> -> <a href="/app/mentor">Imperium</a>
    content = re.sub(r'(<a[^>]*>)Vee(</a>)', r'\1Imperium\2', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

# Process all files
files_to_process = []
for root, dirs, files in os.walk(BASE_DIR):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in files:
        fp = Path(root) / f
        if should_process(fp):
            files_to_process.append(fp)

print(f"Processing {len(files_to_process)} files...")

modified_files = []
for filepath in files_to_process:
    if fix_file(filepath):
        modified_files.append(filepath)
        print(f"  Fixed: {filepath}")

print(f"\nModified {len(modified_files)} files")

if modified_files:
    print("\nModified files:")
    for f in modified_files:
        print(f"  - {f}")
else:
    print("\nNo files needed modification.")
