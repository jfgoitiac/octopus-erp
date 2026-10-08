export function ErrorCampo({ msg }) {
  if (!msg) return null;
  return <span role="alert" className="mt-1 block text-xs font-normal normal-case tracking-normal text-red-600">{msg}</span>;
}
