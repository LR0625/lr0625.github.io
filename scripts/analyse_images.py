"""
素材分析：找出截图里真实 UI 内容的边界，为裁切提供依据。
不修改任何原文件，只读取并输出报告。
"""
import sys
from pathlib import Path
from PIL import Image, ImageChops
import numpy as np

SRC = Path(r"C:\Users\PC\Desktop\zmh")

FILES = [
    "预览-工资池.png",
    "预览-我的-工资进度.png",
    "预览-工资设置.png",
    "预览-课表周视图.png",
    "预览-课表列表.png",
]


def analyse(path: Path) -> None:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    a = np.asarray(im).astype(np.int16)

    # 背景 = 四条边采样出的众数颜色
    border = np.concatenate([
        a[0, :, :], a[-1, :, :], a[:, 0, :], a[:, -1, :]
    ])
    bg = np.median(border, axis=0)

    # 与背景差异明显的像素 = 内容
    diff = np.abs(a - bg).sum(axis=2)
    mask = diff > 24

    cols = mask.any(axis=0)
    rows = mask.any(axis=1)

    if not cols.any():
        print(f"{path.name}: 未检测到内容")
        return

    x0, x1 = int(np.argmax(cols)), int(w - np.argmax(cols[::-1]))
    y0, y1 = int(np.argmax(rows)), int(h - np.argmax(rows[::-1]))

    ink = mask.mean()
    print(f"\n=== {path.name} ===")
    print(f"  原始尺寸 : {w} x {h}   (比例 1:{h/w:.2f})")
    print(f"  背景色   : RGB({int(bg[0])},{int(bg[1])},{int(bg[2])})")
    print(f"  内容边界 : x {x0}..{x1}  y {y0}..{y1}")
    print(f"  内容尺寸 : {x1-x0} x {y1-y0}")
    print(f"  内容占比 : 宽 {(x1-x0)/w:.0%}  高 {(y1-y0)/h:.0%}   像素墨量 {ink:.1%}")

    # 逐行内容密度，找出纵向内容带（用于判断是否是多屏拼接）
    band = mask.mean(axis=1)
    thr = 0.02
    runs, start = [], None
    for i, v in enumerate(band):
        if v > thr and start is None:
            start = i
        elif v <= thr and start is not None:
            if i - start > h * 0.01:
                runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(band)))
    print(f"  纵向内容带 {len(runs)} 段: " +
          ", ".join(f"{s}-{e}({e-s}px)" for s, e in runs[:12]))


if __name__ == "__main__":
    for name in FILES:
        p = SRC / name
        if p.exists():
            analyse(p)
        else:
            print(f"缺失: {name}")
