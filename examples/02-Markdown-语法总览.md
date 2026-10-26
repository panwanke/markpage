---
title: "Markdown 语法总览"
header: "语法自检文档"
footer: "渲染兼容性测试"
paper: A4
fontSize: 16
lineHeight: 1.8
---

# 一级标题 H1

## 二级标题 H2

### 三级标题 H3

#### 四级标题 H4

##### 五级标题 H5

###### 六级标题 H6

## 01. 行内格式

这是**加粗**，这是*斜体*，这是**_加粗斜体_**，这是~~删除线~~，这是 `行内代码`。
混合示例：**这段里有 `代码` 和 _斜体_ 与 ~~删除~~ 同时出现**。

HTML 增强：这是 <mark>高亮文本</mark>，这是 <span style="color:#b3261e">红色文本</span>，这是 <span style="color:#1b6d3a">绿色文本</span>。

转义字符：\* 不是强调 \_ 也不是 \_\_ 强调 \_\_。

## 02. 列表

### 无序列表

- 第一项
- 第二项
  - 嵌套项 A
  - 嵌套项 B
    - 深层嵌套项
- 第三项

- [ ] 未完成任务
- [x] 已完成任务

### 有序列表

1. 第一步
2. 第二步
   1. 子步骤 2.1
   2. 子步骤 2.2
3. 第三步

## 03. 引用

> 简单引用。

> 多层引用：
> > 第二层引用
> > > 第三层引用

> [!note]
> GitHub 风格提示块：note。

> [!warning]
> GitHub 风格提示块：warning。

> [!tip]
> 提示块中可以包含**格式**与 `代码`。

## 04. 代码

行内：`npm install`

```bash
# 安装依赖
npm install
npm run dev
```

```json
{
  "name": "markpage",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build"
  }
}
```

```python
def fibonacci(n: int) -> int:
    """返回第 n 个斐波那契数。"""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```sql
SELECT author, COUNT(*) AS comments
FROM threads
WHERE resolved = FALSE
GROUP BY author
HAVING COUNT(*) > 3
ORDER BY comments DESC;
```

## 05. 表格

| 左对齐 | 居中 | 右对齐 | 默认 |
| :--- | :---: | ---: | --- |
| 单元格 | 单元格 | 单元格 | 单元格 |
| **加粗** | `代码` | ~~删除~~ | <mark>高亮</mark> |
| 较长内容测试换行表现 | 短 | 1 | 2 |

## 06. 链接与图片

行内链接：[墨页文档](https://example.com/docs) 与自动链接 <https://example.com>。

带标题的链接：[示例站点](https://example.com "打开示例")。

![文档结构示意](/research-notes.svg)

## 07. 公式

行内公式：质能方程 $E = mc^2$，条件概率 $P(A \mid B) = \frac{P(B \mid A)P(A)}{P(B)}$。

块级公式：

$$
\hat{\theta}_{\text{MAP}} = \arg\max_{\theta} \left[ \log p(y \mid \theta) + \log p(\theta) \right]
$$

多行对齐：

$$
\begin{aligned}
\mu &= \frac{1}{N}\sum_{i=1}^{N} x_i \\
\sigma^2 &= \frac{1}{N}\sum_{i=1}^{N}(x_i - \mu)^2
\end{aligned}
$$

## 08. 脚注

这里有脚注引用[^a]，还有第二个[^b]。

[^a]: 第一个脚注的内容，用于测试脚注区渲染。
[^b]: 第二个脚注，内容稍长，用于测试脚注区的换行与排序表现是否与引用顺序一致。

## 09. 分隔线与空行

---

分隔线之后是正文段落。本段用于验证分页时段落的间距是否被正确保留，以及段内换行：  
这是同一段落的第二行（行尾有两个空格）。

***

## 10. 评论与标注

这一段包含<comment id="c-syntax-a">一个已存在的评论锚点</comment>，用于验证评论与行内格式的嵌套是否冲突。

**这段同时是加粗并<mark>包含高亮的</mark>内容**，用于验证嵌套标签的源码映射。

> [!comment c-syntax-a]
> **测试者** · 2026-10-25 23:00
> 语法总览文档应确保所有块型都能正常分页。
