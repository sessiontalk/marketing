import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-600">
            SessionTalk
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            Marketing CRM
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in with your admin credentials to continue.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
