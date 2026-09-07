import { SignIn } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export default function SignInPage() {
  return <main className="auth-page"><Brand /><SignIn /></main>;
}
