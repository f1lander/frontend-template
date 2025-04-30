'use client'

import { Button, Card, Input, Spinner } from '@ensdomains/thorin'
import { useState, useEffect } from 'react'
import { useDebounce } from 'usehooks-ts'
import { isAddress } from 'viem/utils'
import { useEnsAddress } from 'wagmi'
import { Result, ok, err } from 'neverthrow'

import { Container, Layout } from '@/components/templates'

// Define error types
type AddressValidationError = {
  type: 'EmptyInput' | 'InvalidAddress' | 'ResolutionFailed'
  message: string
}

export default function Page() {
  const [input, setInput] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const debouncedInput = useDebounce(input, 500)

  const { data: ensAddress, isLoading: ensAddressIsLoading } = useEnsAddress({
    name: debouncedInput.includes('.') ? debouncedInput : undefined,
    chainId: 1,
  })

  const validateAddress = (value: string): Result<string, AddressValidationError> => {
    if (!value.trim()) {
      return err({
        type: 'EmptyInput',
        message: 'Please enter an address or ENS name',
      })
    }

    if (isAddress(value)) {
      return ok(value)
    }

    if (value.includes('.')) {
      if (ensAddressIsLoading) {
        return err({
          type: 'ResolutionFailed',
          message: 'Resolving ENS name...',
        })
      }

      if (ensAddress) {
        return ok(ensAddress)
      }

      return err({
        type: 'ResolutionFailed',
        message: 'Could not resolve ENS name to an address',
      })
    }

    return err({
      type: 'InvalidAddress',
      message: 'Invalid Ethereum address or ENS name',
    })
  }


  const addressResult = input !== debouncedInput 
    ? err({ type: 'EmptyInput', message: 'Still typing...' } as AddressValidationError)
    : validateAddress(debouncedInput)

  const address = addressResult.isOk() ? addressResult.value : undefined

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    if (e.target.value === '') {
      setValidationError(null)
    }
  }

  useEffect(() => {
    if (addressResult.isErr() && input !== '') {
      setValidationError(addressResult.error.message)
    } else {
      setValidationError(null)
    }
  }, [addressResult, input])

  return (
    <Layout>
      <header />

      <Container as="main">
        <Card title="Name/Address Input">
          <Input
            label="Address or ENS Name"
            placeholder="nick.eth"
            description={address || validationError}
            error={!!validationError}
            suffix={ensAddressIsLoading && <Spinner />}
            onChange={handleInputChange}
          />

          <Button 
            disabled={!address} 
            colorStyle="greenPrimary"
            onClick={() => {
              addressResult.match(
                (validAddress) => {
                  console.log('Valid address:', validAddress)
                },
                (error) => {
                  console.error('Validation error:', error.message)
                }
              )
            }}
          >
            {!address ? 'No Address' : 'Nice!'}
          </Button>
        </Card>
      </Container>

      <footer />
    </Layout>
  )
}