import React, { useEffect, useState } from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useForm } from "react-hook-form";
import { Image, Button, FormControl, FormHelperText, FormLabel, HStack, Input, Textarea, VStack, Alert, Text, Heading } from "@chakra-ui/react";
import { truthy, usePrimaryClaimedTokenRef, useProvider, useStrataSdks } from "@strata-foundation/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ExponentialCurveConfig, SplTokenBonding } from "@strata-foundation/spl-token-bonding";
import { createMintInstructions, SplTokenMetadata } from "@strata-foundation/spl-utils";
import { useAsyncCallback } from "react-async-hook";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DataV2 } from "@metaplex-foundation/mpl-token-metadata";
import BN from "bn.js";
import { useRouter } from 'next/router'

interface IMarketplaceFormProps {
  mint: string;
  image: File;
  name: string;
  description: string;
  quantity: number;
  price: number;
}

const validationSchema = yup.object({
  mint: yup.string().required(),
  image: yup.mixed(),
  name: yup.string().required().min(2),
  description: yup.string().required().min(2),
  quantity: yup.number().required().min(1).integer(),
  price: yup.number().required().min(0)
})

async function createMarket(tokenBondingSdk: SplTokenBonding, tokenMetadataSdk: SplTokenMetadata, values: IMarketplaceFormProps): Promise<PublicKey> {
  const mint = new PublicKey(values.mint);
  const me = tokenBondingSdk.wallet.publicKey;
  const instructions = [];
  const signers = [];

  const targetMintKeypair = Keypair.generate();
  const targetMint = targetMintKeypair.publicKey;

  // 1. Submit prepaid txn to metaplex paying for our arweave storage
  // 2. Get a url for our upload arweave files. This is the token metadata
  // 3. Create a mint that we're selling (target mint). 
  // 4. Create metadata for that mint, us as the upload authority
  // 5. Changing mint authority to the bonding curve
  // 6. Create curve
  // 7. Create bonding

  const { txid, files } = await tokenMetadataSdk.presignCreateArweaveUrl({
    name: values.name,
    symbol: "",
    description: values.description,
    image: values.image.name,
    files: [values.image].filter(truthy),
    env: "mainnet-beta",
    uploadUrl: "https://us-central1-metaplex-studios.cloudfunctions.net/uploadFile"
  });
  const uri = await tokenMetadataSdk.getArweaveUrl({
    txid,
    mint: targetMint,
    files,
    env: "mainnet-beta",
    uploadUrl: "https://us-central1-metaplex-studios.cloudfunctions.net/uploadFile"
  });


  instructions.push(...(await createMintInstructions(
    tokenBondingSdk.provider,
    me,
    targetMint,
    0
  )));
  signers.push(targetMintKeypair)
  const { instructions: metadataInstructions, signers: metadataSigners } = await tokenMetadataSdk.createMetadataInstructions({
    data: new DataV2({
      name: values.name,
      symbol: "",
      uri,
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null
    }),
    mint: targetMint,
    mintAuthority: me
  })
  instructions.push(...metadataInstructions)
  signers.push(...metadataSigners)

  instructions.push(
    Token.createSetAuthorityInstruction(
      TOKEN_PROGRAM_ID,
      targetMint,
      (await SplTokenBonding.tokenBondingKey(targetMint))[0],
      "MintTokens",
      me,
      []
    )
  )
  

  const baseStorage = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    me
  );

  if (!await tokenBondingSdk.accountExists(baseStorage)) {
    instructions.push(await Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint,
      baseStorage,
      me,
      me
    ));
  }

  const { instructions: curveInstructions, signers: curveSigners, output: { curve } } = await tokenBondingSdk.initializeCurveInstructions({
    config: new ExponentialCurveConfig({
      c: 0,
      pow: 0,
      frac:  1,
      b: values.price
    })
  })
  instructions.push(...curveInstructions);
  signers.push(...curveSigners);

  const { output: { tokenBonding }, instructions: tokenBondingInstructions, signers: tokenBondingSigners } = await tokenBondingSdk.createTokenBondingInstructions({
    curve,
    targetMint,
    baseStorage,
    mintCap: new BN(values.quantity),
    buyBaseRoyaltyPercentage: 0,
    sellBaseRoyaltyPercentage: 0,
    sellTargetRoyaltyPercentage: 0,
    buyTargetRoyaltyPercentage: 0,
    baseMint: mint
  })

  await tokenBondingSdk.executeBig(Promise.resolve({
    instructions: [instructions, tokenBondingInstructions],
    signers: [signers, tokenBondingSigners],
    output: null
  }));

  return tokenBonding; 
}

export const MarketplaceFrom: React.FC = () => {
  const { 
    register,
    watch,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
    clearErrors
  } = useForm<IMarketplaceFormProps>({
    resolver: yupResolver(validationSchema)
  });
  const { publicKey } = useWallet();
  const { info: tokenRef } = usePrimaryClaimedTokenRef(publicKey)
  const { awaitingApproval } = useProvider();
  const { image } = watch();
  const { loading, error } = useAsyncCallback(createMarket);
  const { tokenBondingSdk, tokenMetadataSdk } = useStrataSdks();
  const router = useRouter();

  const [imgUrl, setImgUrl] = useState<string>();
  const hiddenFileInput = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (image) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImgUrl((event.target?.result as string) || "");
      };

      reader.readAsDataURL(image);
    } else {
      setImgUrl(undefined);
    }
  }, [image]);
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files![0];
    const sizeKB = file.size / 1024;

    if (sizeKB < 25) {
      setError("image", {
        type: "manual",
        message: `The file ${file.name} is too small. It is ${
          Math.round(10 * sizeKB) / 10
        }KB but should be at least 25KB.`,
      });
      return;
    }

    setValue("image", file || null);
    clearErrors("image");
  };

  const onSubmit = async (values: IMarketplaceFormProps) => {
    const tokenBondingKey = await createMarket(tokenBondingSdk!, tokenMetadataSdk!, values)
    router.push("/item/" + tokenBondingKey.toBase58())
  }


  return <form 
    onSubmit={handleSubmit(onSubmit)}
  >
    <VStack spacing={2}>
      <Heading>Sell an Item</Heading>
      <FormControl id="image">
        <FormLabel>Photo</FormLabel>
        {<Image maxWidth="200px" src={imgUrl} />}
        <HStack w="full" spacing={4}>
          <Button
            size="md"
            colorScheme="gray"
            variant="outline"
            onClick={() => hiddenFileInput.current!.click()}
          >
            Choose
          </Button>
        </HStack>
        <input
          id="image"
          type="file"
          accept=".png,.jpg,.gif,.mp4,.svg"
          multiple={false}
          onChange={handleImageChange}
          ref={hiddenFileInput}
          style={{ display: "none" }}
        />
        <FormHelperText color={errors.image?.message && "red.400"}>
          {errors.image?.message || `The image of the item`}
        </FormHelperText>
      </FormControl>
      
      <FormControl id="name">
        <FormLabel htmlFor='name'>Item Name</FormLabel>
        <Input {...register("name")} />
        <FormHelperText color={errors.name?.message && "red.400"}>
          {errors.name?.message || `The name that will be displayed on the storefront for your item`}
        </FormHelperText>
      </FormControl>
      <FormControl id="description">
        <FormLabel htmlFor='description'>Description</FormLabel>
        <Textarea {...register("description")} />
        <FormHelperText color={errors.description?.message && "red.400"}>
          {errors.description?.message || `The description of the item`}
        </FormHelperText>
      </FormControl>

      <FormControl id="quantity">
        <FormLabel htmlFor='quantity'>Quantity</FormLabel>
        <Input type="number" min={1} step={1} {...register("quantity")} />
        <FormHelperText color={errors.quantity?.message && "red.400"}>
          {errors.quantity?.message || `The quantity to stop selling at`}
        </FormHelperText>
      </FormControl>

      <FormControl id="mint">
        <FormLabel htmlFor='mint'>Mint</FormLabel>
        {tokenRef && <Button
          variant="link"
          onClick={() => setValue("mint", tokenRef.mint.toBase58())}
        >
          Use my Social Token
        </Button>}
        <Input {...register("mint")} />
        <FormHelperText color={errors.name?.message && "red.400"}>
          {errors.name?.message || `The mint that should be used to purchase this, example ${NATIVE_MINT.toBase58()}`}
        </FormHelperText>
      </FormControl>

      <FormControl id="price">
        <FormLabel htmlFor='price'>Price</FormLabel>
        <Input type="number" min={0} step={0.0000000001} {...register("price")} />
        <FormHelperText color={errors.price?.message && "red.400"}>
          {errors.price?.message || `The price of the item`}
        </FormHelperText>
      </FormControl>

      {error && <Alert status="error">
        <Alert status="error">
          {error.toString()}
        </Alert>
      </Alert>}

      <Button
        type="submit"
        w="full"
        size="lg"
        colorScheme="blue"
        isLoading={isSubmitting || loading}
        loadingText={awaitingApproval ? "Awaiting Approval" : "Loading"}
      >
        Submit
      </Button>
    </VStack>
  </form>
}
