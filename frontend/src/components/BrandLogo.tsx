export function BrandLogo({ className = "" }: { className?: string }) {
  return <img className={`brand-logo ${className}`.trim()} src="/marcelo-balcar-logo.png" width="102" height="75" alt="Marcelo Balcar" />;
}
