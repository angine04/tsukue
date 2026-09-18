import { AUTHOR_NAME, AUTHOR_ROLE } from "@tsukue/config";

interface NameCardProps {
  name?: string;
  role?: string;
}

/**
 * The business-card face. Shared by the desk rail and the standalone About
 * sheet so both stay in sync.
 */
export default function NameCard({
  name = AUTHOR_NAME,
  role = AUTHOR_ROLE,
}: NameCardProps) {
  return (
    <div className="name-card">
      <span className="name-card-name">{name}</span>
      <span className="name-card-role">{role}</span>
    </div>
  );
}
