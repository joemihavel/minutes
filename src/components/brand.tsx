import Image from "next/image";
import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Minutes home">
      <Image
        className="brand-logo"
        src="/minutes-logo-v4.svg"
        alt=""
        width={129}
        height={38}
        priority
      />
    </Link>
  );
}
