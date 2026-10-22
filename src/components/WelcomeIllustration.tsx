import { useId } from "react";

export function WelcomeIllustration() {
  const id = useId();
  const tealGradient = `${id}-teal`;
  const apricotGradient = `${id}-apricot`;

  return (
    <div className="welcome-illustration" aria-hidden="true">
      <svg
        className="welcome-illustration-art"
        viewBox="0 0 164 192"
        fill="none"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={tealGradient}
            x1="12"
            y1="30"
            x2="79"
            y2="164"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#487783" />
            <stop offset="1" stopColor="#3D6672" />
          </linearGradient>
          <linearGradient
            id={apricotGradient}
            x1="91"
            y1="107"
            x2="137"
            y2="155"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#F2BC7E" />
            <stop offset="1" stopColor="#ECB379" />
          </linearGradient>
        </defs>

        <path
          d="M53 17C68 8 82 10 92 25C99 35 103 46 103 60V150C103 172 86 188 62 191V43L53 17Z"
          fill="#DFE0EF"
        />
        <path
          d="M46 17C57 5 76 4 88 15V149C88 167 70 183 46 184V17Z"
          fill="var(--surface, #FAF9F7)"
          stroke="#B9BDC3"
          strokeWidth="1"
        />
        <path d="M111 105C111 68 130 43 156 37V192H111V105Z" fill="#E2E2F2" />
        <path
          d="M11 28C49 29 79 60 79 99V163H11V28Z"
          fill={`url(#${tealGradient})`}
        />
        <circle cx="112" cy="132" r="33" fill={`url(#${apricotGradient})`} />
      </svg>
    </div>
  );
}
