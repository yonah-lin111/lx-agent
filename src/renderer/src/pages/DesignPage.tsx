import { LxMarkdownEditor } from "@/components/ui/LxMarkdown"

// 默认文案
const defaultContent = `Here are "Hello, World!" programs in several mainstream programming languages:

## Mermaid diagrams

\`\`\`mermaid
flowchart LR
  A[需求] --> B{评审}
  B -->|通过| C[实现]
  B -->|修改| A
  C --> D[验证]
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant E as Editor
  participant P as Preview
  U->>E: Edit Mermaid source
  E->>P: Render SVG
  P-->>U: Pan and zoom diagram
\`\`\`

\`\`\`mermaid
classDiagram
  class MarkdownEditor {
    +content: string
    +render()
  }
  class MermaidDiagram {
    +scale: number
    +pan()
    +zoom()
  }
  MarkdownEditor --> MermaidDiagram
\`\`\`

---

### **1. Python**

\`\`\`python
print("Hello, World!")
\`\`\`

---

### **2. C**

\`\`\`c
#include <stdio.h>

int main() {
    printf("Hello, World!\n");
    return 0;
}
\`\`\`

---

### **3. C++**

\`\`\`cpp
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
\`\`\`

---

### **4. Java**

\`\`\`java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
\`\`\`

---

### **5. JavaScript**

\`\`\`javascript
console.log("Hello, World!");
\`\`\`

---

### **6. Go**

\`\`\`go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
\`\`\`

---

### **7. Rust**

\`\`\`rust
fn main() {
    println!("Hello, World!");
}
\`\`\`

---

### **8. PHP**

\`\`\`php
<?php
echo "Hello, World!";
?>
\`\`\`
`

/**
 * 渲染设计页面。
 */
export const DesignPage = (): React.JSX.Element => (
  <LxMarkdownEditor initialContent={defaultContent} />
)
