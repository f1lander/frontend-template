import { getDefaultWallets } from '@rainbow-me/rainbowkit'
import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, holesky } from 'wagmi/chains'

const WALLETCONNECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_ID

if (!WALLETCONNECT_ID) {
  throw new Error('Missing NEXT_PUBLIC_WALLETCONNECT_ID')
}

const { connectors } = getDefaultWallets({
  appName: 'ENS Frontend Template',
  projectId: WALLETCONNECT_ID,
})

const chains = [mainnet, sepolia, holesky] as const

export const wagmiConfig = createConfig({
  chains,
  connectors,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [holesky.id]: http(),
  },
})
