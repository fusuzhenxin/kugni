import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="container error-page">
      <span className="eyebrow">404</span>
      <h1>这条连接暂时没有找到</h1>
      <p>页面可能已调整，去目录看看新的发现。</p>
      <Link className="button" href="/stations/">
        浏览站点
      </Link>
    </main>
  );
}
