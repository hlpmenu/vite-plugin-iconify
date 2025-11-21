# **Iconify Plugin Test Coverage**

This document outlines the test coverage for the Iconify plugin.

* **Black Text items** in the test suite indicate the icon was successfully resolved and inlined at build-time.  
* **Red Text items** indicate the plugin had to fall back to a dynamic component (runtime resolution).

## **Summary**

| Status | Indicator | Meaning |
| :---- | :---- | :---- |
| **Resolved / Statically Inlined** | ⚫ Black | Compiler successfully extracted the icon. |
| **Dynamic Fallback** | 🔴 Red | Compiler could not resolve; runtime fallback used. |

## **Detailed Test Cases**

### **✅ Resolved / Statically Inlined (Black)**

These patterns are successfully detected and inlined by the compiler, including static string manipulation and object lookups.

| ID | Test Case | Example Syntax / Condition |
| :---- | :---- | :---- |
| 1 | Static literal | icon="mdi:github" |
| 2 | Bound literal | :icon="'mdi:github'" |
| 3 | Wrapped literal | :icon="('mdi:github')" |
| 4 | Conditional | a ? 'mdi:github' : 'mdi:github-face' |
| 5 | Conditional with spacing | a ? 'mdi:github' : 'mdi:github-face' |
| 6 | Conditional wrapped in parentheses | (condition ? '...' : '...') |
| 7 | Conditional with complex condition | ((a && b) ? ...) |
| 8 | Conditional with outer whitespace | :icon="..." |
| 9 | Conditional \+ extra attributes | class, data-test mixed with icon logic |
| 10 | Literal \+ multiple passthrough attributes | Attributes passed through to SVG |
| 11 | Dynamic name | Variable icon name (if resolved in scope) |
| 12 | Function call | :icon="getIcon()" |
| 13 | String concatenation | :icon="'mdi:' \+ iconName" |
| 14 | Imported const | :icon="MyIconConst" |
| 15 | Array literal index | iconArray\[0\] |
| 16 | Array index variable | iconArray\[arrayIndex\] |
| 17 | Object dot access | iconObject.github |
| 18 | Object bracket access | iconObject\['github'\] |
| 19 | Nested object access | nestedIconMap.mdi.github |
| 20 | Template literal static | \`mdi:github\` |
| 21 | Template literal with variable | \`mdi:${iconKey}\` |
| 22 | Trimmed string | ' mdi:github '.trim() |
| 23 | Lowercased string | 'MDI:GITHUB'.toLowerCase() |
| 24 | Split \+ index | \`'mdi:github |
| 25 | Nullish coalescing | maybeIcon ?? fallbackIcon |
| 26 | Parenthesized concatenation | ('mdi:' \+ 'github') |

### **⚠️ Dynamic Fallback (Red)**

These patterns forced the plugin to bail out of static compilation and use the runtime fallback.

| ID | Test Case | Example Syntax / Condition |
| :---- | :---- | :---- |
| 27 | Function Ternary | isTrue() ? githubIcon : xIcon |
| 28 | Fully runtime dependent | isFunctionTernaryTrue() ? githubIcon : xIcon |
| 28 | Fully runtime dependent | Complex ternary logic |
| 30 | Trimmed string using wrapper | trim(' mdi:github') |
