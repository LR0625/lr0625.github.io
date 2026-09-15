/**
 * 构建前清空 dist。
 *
 * 为什么需要它：Astro 在某些环境下不会清掉上一次构建留下的文件，
 * 结果是「已经删除的页面仍然躺在 dist 里，并被一起部署上线」。
 *
 * 为什么不用一行 node -e：在 Windows 上 node 的 rmSync 可能静默失败
 * （不抛错，但目录还在）。这里显式复查，删不掉就明确警告，
 * 而不是让构建看起来成功了、实际带着陈旧文件发上去。
 */
import { rmSync, existsSync } from 'node:fs';

const target = 'dist';

if (!existsSync(target)) {
  console.log('dist 不存在，无需清理');
  process.exit(0);
}

try {
  rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
} catch (err) {
  console.warn(`清理 dist 时出错：${err.code ?? err.message}`);
}

if (existsSync(target)) {
  console.warn(
    '\n\x1b[33m⚠  dist 没能被清空\x1b[0m\n' +
      '   本次构建可能把上一次的陈旧页面一起带上。\n' +
      '   请手动删除 dist 目录后重新构建：\n' +
      '     PowerShell:  Remove-Item dist -Recurse -Force\n',
  );
  // 不中断构建：留下陈旧文件总比构建失败好，但要让人看见警告
  process.exit(0);
}

console.log('dist 已清空');
