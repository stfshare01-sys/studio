---
description: Principios, prácticas y arquitectura para evitar regresiones ("avanzar un paso y retroceder dos") y reducir el acoplamiento en el código.
---

# /clean-code — Principios de Código Limpio y Anti-Fragilidad

Seguir **SIEMPRE** estas prácticas al momento de corregir bugs, agregar nuevas funciones o refactorizar código para evitar romper funcionalidades existentes:

## 1. Principio de Abierto/Cerrado (OCP - Open/Closed Principle)
Este es el segundo de los principios SOLID y ataca directamente el problema de "avanzar un paso, retroceder dos". Establece que el código debe estar **abierto para la extensión pero cerrado para la modificación**. 
- **Regla:** Esto significa que, si necesitas agregar una nueva función, debes poder hacerlo escribiendo código nuevo, en lugar de modificar y poner en riesgo el código que ya funciona correctamente.
- **Práctica:** Para lograrlo, se utilizan abstracciones (como interfaces, hooks genéricos o componentes base), permitiendo que el sistema crezca sin alterar su núcleo vital.

## 2. Principio de Responsabilidad Única (SRP) y Bajo Acoplamiento
Una clase, componente o función debe hacer **una sola cosa** y tener un único motivo para cambiar.
- **Regla:** Evita componentes "Dios" (God objects) o funciones de configuración masivas. Divídelas lógicamente.
- **Práctica:** Diseña el software con alta cohesión y bajo acoplamiento. Si modificas la lógica de UI, la lógica de datos no debería verse afectada y viceversa. Un cambio en una parte no debe propagarse de forma no deseada a otra.

## 3. Pruebas Automatizadas (TDD como red de seguridad)
La "red de seguridad" principal contra las modificaciones destructivas es el soporte automatizado.
- **Pruebas unitarias:** Valida el comportamiento esperado de cada módulo de forma aislada.
- **Detección Inmediata:** Si una corrección rompe una función del pasado, tu prueba debería avisarte antes de que el código pase a producción. Si no existen pruebas formales, **prueba de manera manual pero exhaustiva** las áreas colaterales a la función editada.

## 4. Integración Continua (CI)
- **Regla:** Apóyate en las integraciones (GitHub Actions, etc.) para asegurar que cualquier modificación pase siempre un flujo estandarizado (Typescript compiler, Linting, Build test).
- **Práctica:** Nunca obvies los errores de linter o compilación. Resuélvelos de forma temprana para asegurar la correcta integración del código.

## 5. Refactorización Regular (Cero Parches Rápidos)
- **Regla:** No acumules deuda técnica. En lugar de poner "parches" rápidos a los errores (`if (bug) fix()`), entiende el problema raíz.
- **Práctica:** Mejora continuamente la estructura interna sin cambiar su comportamiento externo. Si descubres que una función fue mal diseñada, tómate el tiempo para desacoplarla de manera limpia antes de agregarle más lógica encima.
