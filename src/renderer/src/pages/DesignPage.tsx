import { LxMarkdownEditor } from "@/components/ui/LxMarkdownEditor"

// 默认文案
const defaultContent = `Here are "Hello, World!" programs in several mainstream programming languages:

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
