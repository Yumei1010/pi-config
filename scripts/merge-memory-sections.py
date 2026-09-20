"""合并记忆文件里重复的同名小节（project-memory 的 \b bug 造成），并去掉同段内完全相同的条目。

背景：project-memory 早期版本用 \b 收尾匹配中文小节标题（如 "## 备注 (notes)"），
而 JS 的 \b 基于 ASCII 词字符、对中文永不成立 → 每次 append 都会新建一个小节，
历史记忆里因此叠出多段同名小节。该 bug 已在 2026-09-18 修复（extensions/project-memory/index.ts）；
清理已被叠出的多段小节：只合并小节、不删除不同内容（同段内完全相同的条目会去重并报告）。

用法：
  python merge-memory-sections.py --dry <file...>   # 只报告
  python merge-memory-sections.py <file...>         # 就地写回
"""
import io
import re
import sys

SECTIONS = [
    ("goal", "目标"),
    ("progress", "当前任务"),
    ("completed", "已完成"),
    ("decisions", "决策"),
    ("todos", "待办"),
    ("files", "关键文件"),
    ("notes", "备注"),
]


def heading_key(line: str):
    m = re.match(r"^##\s*(.+?)\s*$", line)
    if not m:
        return None
    text = m.group(1)
    for key, cn in SECTIONS:
        if re.match(rf"^(?:{cn}|{key})(?:\s*\([^)]*\))?$", text, re.I):
            return key
    return None


def merge(text: str):
    lines = text.split("\n")
    preamble = []
    blocks = []  # [key|None, heading_line, body_lines]
    cur = None
    for line in lines:
        key = heading_key(line)
        if key is not None:
            cur = [key, line, []]
            blocks.append(cur)
        elif cur is None:
            preamble.append(line)
        else:
            cur[2].append(line)

    # 合并：同名小节的内容按出现顺序拼接；非标准小节保持原位
    order = []
    merged = {}
    passthrough = []
    for key, heading, body in blocks:
        if key is None:
            passthrough.append((heading, body))
            continue
        if key not in merged:
            merged[key] = {"heading": heading, "body": []}
            order.append(key)
        merged[key]["body"].extend(body)

    removed_lines = 0
    out = []
    out.extend(preamble)
    for key in order:
        info = merged[key]
        seen = set()
        body = []
        for line in info["body"]:
            norm = line.strip()
            if norm.startswith("- ") and norm in seen:
                removed_lines += 1
                continue
            if norm.startswith("- "):
                seen.add(norm)
            body.append(line)
        # 去掉段尾多余空行
        while body and body[-1].strip() == "":
            body.pop()
        out.append(info["heading"])
        out.extend(body)
        out.append("")
    for heading, body in passthrough:
        out.append(heading)
        out.extend(body)
        out.append("")

    result = "\n".join(out).rstrip("\n") + "\n"
    return result, len(blocks), len(order), removed_lines


def main():
    dry = "--dry" in sys.argv
    files = [a for a in sys.argv[1:] if a != "--dry"]
    for path in files:
        raw = io.open(path, encoding="utf-8", newline="").read()
        crlf = "\r\n" in raw
        text = raw.replace("\r\n", "\n")
        result, before, after, removed = merge(text)
        if result == text:
            print(f"  = {path}：无需改动（小节 {before} 个）")
            continue
        print(
            f"  * {path}：小节块 {before} → {after}，合并删除重复条目 {removed} 条，"
            f"{len(raw)} → {len(result)} 字节"
        )
        if not dry:
            io.open(path, "w", encoding="utf-8", newline="\r\n" if crlf else "\n").write(result)


main()
