"use client";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { InputForm } from "@/components/ui/input/input-form";
import { useAuth } from "@/contexts/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
});

type LoginValuesType = z.infer<typeof loginFormSchema>;

const defaultValues: LoginValuesType = {
  email: "",
  password: "",
};

const LoginForm = () => {
  const router = useRouter();
  const { signIn } = useAuth();

  const form = useForm<LoginValuesType>({
    resolver: zodResolver(loginFormSchema),
    defaultValues,
  });

  async function handleLogin(values: LoginValuesType) {
    try {
      const { email, password } = values;
      
      // Show loading toast
      const loadingToast = toast.loading("Logging in...");
      
      console.log("Attempting login for:", email);
      const result = await signIn(email, password);
      
      console.log("Login result:", result);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      // If result is undefined or null, handle that case
      if (!result) {
        console.error("Login returned undefined/null result");
        toast.error("Login failed. Please try again.");
        return;
      }

      const { error, success } = result;

      if (error) {
        console.error("Login error from response:", error);
        toast.error(error);
        return;
      }

      if (success) {
        console.log("Login successful, preparing to redirect...");
        toast.success("Login successful!");
        
        // Use multiple fallback approaches for redirection
        // This helps ensure redirection works across environments
        
        try {
          // 1. First attempt - Use Next.js router with refresh
          console.log("Redirect attempt 1: Next.js router");
          router.push("/");
          router.refresh();
          
          // 2. Fallback - Use direct window location after a short delay
          setTimeout(() => {
            if (window.location.pathname.includes("/login")) {
              console.log("Redirect attempt 2: Direct window.location (500ms)");
              window.location.href = "/";
            }
          }, 500);
          
          // 3. Final fallback - Force reload after a longer delay if still on login page
          setTimeout(() => {
            if (window.location.pathname.includes("/login")) {
              console.log("Redirect attempt 3: Force reload (1000ms)");
              window.location.reload();
              setTimeout(() => window.location.href = "/", 100);
            }
          }, 1000);
        } catch (redirectError) {
          // 4. Error fallback - If all else fails
          console.error("Error during redirect:", redirectError);
          window.location.href = "/";
        }
      }
    } catch (err: any) {
      console.error("Login error in try/catch:", err);
      toast.error(err.message || "An unexpected error occurred");
      form.reset(defaultValues);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleLogin)}
        className="w-full flex flex-col gap-y-4"
      >
        <InputForm
          label="Email"
          name="email"
          placeholder="hello@example.com"
          description=""
          required
        />

        <InputForm
          type="password"
          label="Password"
          name="password"
          description=""
          required
        />

        <Button disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Logging in..." : "Login"}
        </Button>
      </form>
    </Form>
  );
};

export default LoginForm;
