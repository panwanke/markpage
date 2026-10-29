---
title: MarkPage 测试笔记
header: Shared engine · Obsidian
footer: Synthetic test vault
paper: A4
fontSize: 17
lineHeight: 1.85
tags: [markpage, test]
customProperty: "请保留此属性"
---

# 在 Obsidian 中测试 MarkPage

请关闭同文件的原生编辑窗格，或切到阅读模式，再测试 MarkPage 写入。

这是一份合成笔记。选择这段文字，可以测试 **加粗**、<mark>高亮</mark>、<span style="color:#b3261e">文字颜色</span> 和评论。

## 链接与嵌入

[[Notes/Target|打开目标笔记]] · [[Notes/Target#第二节]] · [[Notes/Target#^target-block]] · [[不存在的笔记]]

[标准 Markdown 链接](Notes/Target.md#第二节)

![[Notes/Target#第二节]]

![[Image.svg]]

> [!note] Callout
> 测试嵌入、引用与共享排版。

## 公式与代码

行内公式 $E=mc^2$。

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

```ts
const message = 'MarkPage shared editor'
```

- [ ] 未完成任务
- [x] 已完成任务

## 修订与映射

这段包含 <ins>新增修订</ins> 和 ~删除修订~。

实体 &amp;、转义 \*、emoji 👩‍🔬。无法证明准确映射的显示选区应拒绝格式操作；可以使用源码选区。

## 保存测试

base-001
