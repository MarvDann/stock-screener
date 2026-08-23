<script setup lang="ts"></script>

<template>
  <div class="app-shell">
    <nav class="sidebar">
      <h1 class="brand">Stock Screener</h1>
      <RouterLink to="/breakout" class="nav-link">Breakout</RouterLink>
      <RouterLink to="/sector-rotation" class="nav-link">Sector Rotation</RouterLink>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #0f172a;
  color: #e2e8f0;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.brand {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #f8fafc;
}
.nav-link {
  color: #cbd5e1;
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
}
.nav-link:hover {
  background: #1e293b;
}
.nav-link.router-link-active {
  background: #2563eb;
  color: white;
}
.content {
  flex: 1;
  padding: 32px;
  background: #f8fafc;
}
</style>
