# Emblem Delivery Partner App

This is the dedicated rider React Native/Expo entrypoint. It shares the existing backend and reuses the delivery client, authentication, navigation components, and delivery context from `Quick-Commerce`; no backend logic is duplicated.

Configure the shared API client through `EXPO_PUBLIC_API_URL`. The app accepts only users whose backend role is `delivery`; customer and admin sessions are rejected and signed out.

The rider workflow uses foreground polling. It intentionally does not implement GPS tracking or WebSockets.
