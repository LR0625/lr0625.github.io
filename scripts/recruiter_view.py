"""
以「招聘者扫读」的视角还原页面：按 DOM 顺序抽出可见文本。
用途是评估信息顺序、密度和阅读成本，不是替代视觉检查。
"""
import re
import sys
from pathlib import Path

DIST = Path(r"C:\Users\PC\Desktop\个人网站\dist")

SKIP = {"script", "style", "svg", "head", "noscript"}


def visible_text(html: str) -> list[str]:
    """按顺序抽出可见文本块。"""
    html = re.sub(r"(?is)<(script|style|svg|head|noscript)\b.*?</\1>", " ", html)
    # 块级元素之间插入换行，保留结构
    html = re.sub(r"(?i)</(p|div|li|h[1-6]|section|header|footer|dd|dt|figcaption|tr|aside|nav)>", "\n", html)
    html = re.sub(r"(?i)<br\s*/?>", "\n", html)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    lines = []
    for raw in text.split("\n"):
        s = re.sub(r"[ \t\u3000]+", " ", raw).strip()
        if s:
            lines.append(s)
    return lines


def cjk_len(s: str) -> int:
    return len(re.findall(r"[\u4e00-\u9fff]", s))


def report(path: Path, label: str, head: int = 0) -> None:
    html = path.read_text(encoding="utf-8", errors="ignore")
    lines = visible_text(html)
    body = "\n".join(lines)
    cjk = cjk_len(body)
    words = len(re.findall(r"[A-Za-z]+", body))

    print(f"\n{'='*72}")
    print(f"{label}")
    print(f"{'='*72}")
    print(f"可见文本块 {len(lines)} 个 | 中文字 {cjk} | 英文词 {words} "
          f"| 估算阅读 {cjk/350 + words/200:.1f} 分钟")
    print("-" * 72)

    show = lines if head == 0 else lines[:head]
    for i, s in enumerate(show, 1):
        print(f"{i:3d}| {s[:110]}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "home"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    pages = {
        "home": ("index.html", "首页（招聘者第一眼）"),
        "p1": ("projects/work-salary/index.html", "Project 01 · AI 工作与薪资管理应用"),
        "p2": ("projects/vibe-community/index.html", "Project 02 · Vibe Coding App Store"),
        "list": ("projects/index.html", "Projects 列表"),
        "about": ("about/index.html", "About"),
    }
    f, label = pages[target]
    report(DIST / f, label, limit)
