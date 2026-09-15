"""
Project 01 素材处理。

只读取原项目截图，输出到本站 src/assets/，绝不修改原文件。
处理内容：裁掉空白画布、缩放到合理尺寸、保留 PNG 母版（由 Astro 在构建时
生成 webp/avif 与多尺寸变体）。
"""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\PC\Desktop\zmh")
OUT = Path(r"C:\Users\PC\Desktop\个人网站\src\assets\projects\work-salary")
OUT.mkdir(parents=True, exist_ok=True)

# (源文件, 输出名, 裁切框或 None, 目标宽度)
JOBS = [
    # 手机竖屏三张已经是合适尺寸，只做轻度重采样
    ("预览-工资池.png", "home-salary-pool.png", None, 780),
    ("预览-我的-工资进度.png", "profile-progress.png", None, 780),
    ("预览-工资设置.png", "salary-settings.png", None, 780),
    # 长截图裁掉底部空白画布（分析得出内容边界）
    ("预览-课表周视图.png", "schedule-week.png", (0, 0, 3060, 1950), 1600),
    ("预览-课表列表.png", "schedule-list.png", (0, 0, 3240, 4900), 1200),
]


def process():
    total_before = total_after = 0
    for name, out_name, box, target_w in JOBS:
        src = SRC / name
        if not src.exists():
            print(f"!! 缺失 {name}")
            continue

        im = Image.open(src).convert("RGB")
        total_before += src.stat().st_size

        if box:
            im = im.crop(box)

        if im.width > target_w:
            h = round(im.height * target_w / im.width)
            im = im.resize((target_w, h), Image.LANCZOS)

        dest = OUT / out_name
        im.save(dest, "PNG", optimize=True)
        total_after += dest.stat().st_size

        print(
            f"{name:26s} -> {out_name:24s} "
            f"{im.width:5d}x{im.height:<5d}  {dest.stat().st_size/1024:7.1f} KB"
        )

    print(f"\n合计: {total_before/1024/1024:.2f} MB -> {total_after/1024/1024:.2f} MB")


if __name__ == "__main__":
    process()
