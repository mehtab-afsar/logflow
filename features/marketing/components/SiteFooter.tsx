import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-2 px-7 py-8 text-[13px] text-ink-3">
        <span>LogiFlow · Bengaluru, Karnataka</span>
        <a href="mailto:hello@logiflow.in" className="hover:text-ink-2">
          hello@logiflow.in
        </a>
        <a href="tel:+919876543210" className="font-mono hover:text-ink-2">
          +91 98765 43210
        </a>
        <span className="ml-auto flex gap-4">
          <a href="#" className="hover:text-ink-2">Terms</a>
          <a href="#" className="hover:text-ink-2">Privacy</a>
          <Link href="/login" className="hover:text-ink-2">Sign in</Link>
        </span>
      </div>
    </footer>
  );
}
