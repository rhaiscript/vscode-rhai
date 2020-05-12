


Awsl 中所有函数都是有返回值的.

如果返回值不是 Html 那么会调用 `to_html` 方法.



```awsl
<div contenteditable=true class="test"></div>

<div contenteditable=true class="test"/>

div(
    contenteditable=true
    class="test"
    children=[]
)
```

这三种是等价的, 都会编译为:

```html
<div contenteditable="true" class="test"></div>
```
