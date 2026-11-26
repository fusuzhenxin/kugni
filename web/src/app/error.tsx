"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="container error-page">
      <h1>暂时无法加载这个页面</h1>
      <p>请检查服务是否已启动，或稍后重新尝试。</p>
      <button className="button" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
