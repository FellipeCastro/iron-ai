export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-20 rounded-full bg-[#ececec]" />
      <div className="mt-4 h-11 w-72 rounded-full bg-[#ececec]" />
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[236px] rounded-[28px] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]" />
        ))}
      </div>
    </div>
  );
}
