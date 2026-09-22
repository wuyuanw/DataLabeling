<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">S</span>
      <strong>SOP 数据工作台</strong>
    </div>
  </header>
</template>

<style scoped>
.topbar { height: 58px; flex: 0 0 58px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; background: linear-gradient(180deg, #181d27 0%, #121721 100%); border-bottom: 1px solid #28313d; box-shadow: 0 3px 14px #0006; }
.brand { display: flex; align-items: center; gap: 11px; font-size: 20px; letter-spacing: 0.3px; }
.brand-mark { width: 27px; height: 27px; display: grid; place-items: center; border-radius: 7px; font-size: 15px; font-weight: 900; color: #071914; background: linear-gradient(135deg, #39e2c2, #20a8c8); box-shadow: 0 0 18px #29d3b944; }

@media (max-height: 760px) {
  .topbar { height: 50px; flex-basis: 50px; }
}
</style>
