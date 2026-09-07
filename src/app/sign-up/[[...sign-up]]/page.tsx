import { SignUp } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export default function SignUpPage() {
  return <main className="auth-page"><Brand /><SignUp /></main>;
}
