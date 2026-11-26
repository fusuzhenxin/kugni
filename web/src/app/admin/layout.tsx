export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="platform-site">{children}</div>;
}
