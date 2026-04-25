import { getStrength, STRENGTH_COLORS } from '@/lib/utils';

interface Props { password: string; }

export function PasswordStrengthMeter({ password }: Props) {
  const { score, label } = getStrength(password);
  return (
    <div className="space-y-1 pt-0.5">
      <div className="flex gap-0.5 h-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-colors duration-200 ${
              score >= i ? STRENGTH_COLORS[score] : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
